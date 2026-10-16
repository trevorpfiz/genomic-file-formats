// The hosted copy of the course (docs/PLAN.md D-28, D-29). Shared by vite.config.ts, the dist
// check and the e2e tests, so they always agree on the URL.

export const DEFAULT_PAGES_URL = "https://trevorpfiz.github.io/genomic-file-formats/";

/**
 * PAGES_URL wins; in GitHub Actions the URL is derived from GITHUB_REPOSITORY ("owner/name");
 * otherwise the canonical repository's URL.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function pagesUrl(env = process.env) {
  if (env.PAGES_URL) return env.PAGES_URL;
  const [owner, name] = (env.GITHUB_REPOSITORY ?? "").split("/");
  if (owner && name) {
    const host = `${owner.toLowerCase()}.github.io`;
    return name.toLowerCase() === host ? `https://${host}/` : `https://${host}/${name}/`;
  }
  return DEFAULT_PAGES_URL;
}
