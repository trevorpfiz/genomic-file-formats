// The lessons plugin: compiles content/lessons/**/*.md into the virtual module `virtual:lessons`
// and resolves every directive against the exercise registry (docs/PLAN.md 11.1).
//
// The registry is loaded through Vite's own module graph, never with Node's `import()`: Node's
// ESM cache keeps child modules even when the parent is re-imported with a cache-busting query,
// so an exercise added to a child module would stay invisible until a restart (V-44).
//
// - Dev: the SSR environment of the running server is a RunnableDevEnvironment; its module
//   runner imports the registry. When any file changes, Vite invalidates that file and its
//   importers in every environment's module graph, so the next `runner.import()` re-fetches
//   exactly the stale modules. `server.ssrLoadModule()` is the legacy wrapper over the same
//   runner and module graph in Vite 8.
// - Build: `runnerImport()` evaluates the registry in a fresh, throwaway environment for each
//   build, and reports the files it evaluated so they are watched in `vp build --watch`.
import { globSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  isRunnableDevEnvironment,
  normalizePath,
  runnerImport,
  type EnvironmentModuleGraph,
  type EnvironmentModuleNode,
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
} from "vite-plus";
import { compileLesson, type CompiledPage, type RegistryEntry } from "./lesson-compiler.ts";

export const LESSONS_ID = "virtual:lessons";
const RESOLVED_ID = `\0${LESSONS_ID}`;

export interface LessonsPluginOptions {
  /** Module exporting `exercises: Record<string, { kind, title }>`. Pure TS, no Vite-only imports. */
  registry: string;
  /** Glob for content files, relative to the root. */
  content?: string;
}

interface RegistryModule {
  exercises: Record<string, { kind: string; title?: string }>;
}

export function lessons(options: LessonsPluginOptions): Plugin {
  const contentGlob = options.content ?? "content/lessons/**/*.md";
  let config: ResolvedConfig;
  let registryPath = "";
  let server: ViteDevServer | undefined;
  /** Files the registry was evaluated from, last time it loaded. */
  let registryFiles = new Set<string>();

  const isContentFile = (file: string) =>
    file.endsWith(".md") && normalizePath(relative(config.root, file)).startsWith("content/lessons/");

  async function loadRegistry(addWatchFile: (file: string) => void): Promise<Map<string, RegistryEntry>> {
    let mod: RegistryModule;
    const ssr = server?.environments.ssr;
    if (server && ssr && isRunnableDevEnvironment(ssr)) {
      mod = await ssr.runner.import<RegistryModule>(registryPath);
      registryFiles = collectFiles(ssr.moduleGraph, registryPath);
    } else {
      const result = await runnerImport<RegistryModule>(registryPath, {
        root: config.root,
        logLevel: "error",
      });
      mod = result.module;
      registryFiles = new Set([registryPath, ...result.dependencies.map((f) => normalizePath(f))]);
      registryFiles.forEach(addWatchFile);
    }
    if (!mod.exercises) throw new Error(`${options.registry} does not export "exercises"`);
    return new Map(Object.entries(mod.exercises).map(([id, e]) => [id, { kind: e.kind, title: e.title }]));
  }

  return {
    name: "gf-lessons",
    configResolved(resolved) {
      config = resolved;
      registryPath = normalizePath(resolve(config.root, options.registry));
    },
    configureServer(devServer) {
      server = devServer;
    },
    resolveId(id) {
      return id === LESSONS_ID ? RESOLVED_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const registry = await loadRegistry((file) => this.addWatchFile(file));
      const files = globSync(contentGlob, { cwd: config.root })
        .map((f) => normalizePath(resolve(config.root, f)))
        .sort();
      const release = process.env.COURSE_RELEASE === "1";
      const pages: CompiledPage[] = [];
      for (const file of files) {
        this.addWatchFile(file);
        const source = readFileSync(file, "utf8");
        try {
          pages.push(await compileLesson(source, file, { registry, release }));
        } catch (err) {
          const e = err as { reason?: string; message: string; line?: number; column?: number };
          this.error({
            message: e.reason ?? e.message,
            id: file,
            loc: { file, line: e.line ?? 1, column: e.column ?? 1 },
          });
        }
      }
      const seen = new Map<string, string>();
      for (const [i, page] of pages.entries()) {
        const other = seen.get(page.meta.id);
        if (other) this.error(`Page id "${page.meta.id}" is used by ${other} and ${files[i]}`);
        seen.set(page.meta.id, files[i] ?? "");
      }
      // Relative images become imports, so Vite inlines them as data: URIs.
      const imports: string[] = [];
      const entries = pages.map((page, p) => {
        const html = page.images.reduce((expr, src, i) => {
          const name = `__img${p}_${i}`;
          imports.push(`import ${name} from ${JSON.stringify(resolve(files[p] ?? "", "..", src))};`);
          return `${expr}.replaceAll(${JSON.stringify(`__GF_IMG_${i}__`)}, ${name})`;
        }, JSON.stringify(page.html));
        const { html: _html, sources: _sources, ...rest } = page;
        return `{ ...${JSON.stringify(rest)}, file: ${JSON.stringify(normalizePath(relative(config.root, files[p] ?? "")))}, html: ${html} }`;
      });
      return `${imports.join("\n")}\nexport const lessons = [\n${entries.join(",\n")}\n];\n`;
    },
    // Recompile the lessons when a content file or anything the registry imports changes.
    // A new exercise module only matters once a registry module imports it, and that edit is a
    // change to a file the registry already depends on.
    hotUpdate({ file, modules }) {
      if (this.environment.name !== "client") return undefined;
      if (!isContentFile(file) && !registryFiles.has(file)) return undefined;
      const mod = this.environment.moduleGraph.getModuleById(RESOLVED_ID);
      if (!mod) return undefined;
      this.environment.moduleGraph.invalidateModule(mod);
      return [...modules, mod];
    },
  };
}

/** Project files reachable from `entry` in an environment's module graph. */
function collectFiles(graph: EnvironmentModuleGraph, entry: string): Set<string> {
  const files = new Set<string>();
  const stack: (EnvironmentModuleNode | undefined)[] = [graph.getModuleById(entry)];
  const seen = new Set<EnvironmentModuleNode>();
  while (stack.length) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    if (node.file && !node.file.includes("/node_modules/")) files.add(node.file);
    stack.push(...node.importedModules);
  }
  return files;
}
