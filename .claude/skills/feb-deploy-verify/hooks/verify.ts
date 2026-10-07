// Pure helpers, no `$`, so the tests can drive them directly.

export type FileCheck = { rel: string; ok: boolean; status: number; matches: boolean; local: string; live: string }

const TEXT = /\.(js|mjs|html|css|json)$/
const MAX = 8

export function isHostingDeploy(command: string): boolean {
  return /\bfirebase\s+deploy\b[^\n;&|]*--only[= ]\s*["']?[^\s"']*\bhosting\b/.test(command)
}

// The files the last commit changed under the hosting root, as paths relative
// to it, plus core.js always (it carries APP_VERSION). Text only, capped.
export function filesToCheck(diffNames: string, publicDir: string): string[] {
  const changed = diffNames.split('\n').map(s => s.trim())
    .filter(s => s.startsWith(publicDir))
    .map(s => s.slice(publicDir.length))
    .filter(s => TEXT.test(s) && !s.split('/').some(p => p.startsWith('.')))
  return ['core.js', ...changed.filter(s => s !== 'core.js')].slice(0, MAX)
}

export function versionIn(text: string): string | undefined {
  return text.match(/\bAPP_VERSION\s*=\s*["']([^"']+)["']/)?.[1]
}

export function summarize(
  results: FileCheck[],
  head: string,
  versions?: { local?: string; live?: string },
): { ok: boolean; text: string } {
  const bad = results.filter(r => !r.matches)
  const v = versions ? ` APP_VERSION local ${versions.local ?? '?'}, live ${versions.live ?? '?'}.` : ''
  if (!bad.length) {
    return { ok: true, text: `feb-deploy-verify: the live host matches commit ${head} for all ${results.length} checked file(s) (${results.map(r => r.rel).join(', ')}).${v}` }
  }
  const lines = bad.map(r => `- ${r.rel}: ${r.ok ? 'live content differs from the commit' : `HTTP ${r.status}`}`)
  return {
    ok: false,
    text: `feb-deploy-verify: the live host does NOT match commit ${head}.${v}\n${lines.join('\n')}\nDo not report this deploy as done. Check whether the deploy ran from the right tree, then redeploy.`,
  }
}
