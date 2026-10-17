/// <reference types="vite-plus/client" />

/** Tag or commit the file was built from ("dev" locally). */
declare const __COURSE_VERSION__: string;
/** The hosted copy of the course (GitHub Pages). */
declare const __PAGES_URL__: string;

declare module "virtual:lessons" {
  type CompiledPage = import("../plugins/lesson-compiler.ts").CompiledPage;
  /** Every compiled content file, in folder and file-prefix order. */
  export const lessons: (Omit<CompiledPage, "sources"> & { file: string })[];
}

/** lucide-static ships one ESM module per icon, exporting the SVG markup as a string. */
declare module "lucide-static/dist/esm/icons/*.mjs" {
  const svg: string;
  export default svg;
}
