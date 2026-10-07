import type { EngineInterface, Register } from 'claude-code'

import { filesToCheck, isHostingDeploy, summarize, versionIn } from './verify'
import type { FileCheck } from './verify'

const SCOPE = '/composites_programs/'
const HOST = 'https://feb-composites.web.app'
const PUBLIC = '06 Composites App/app/'

// "Deploy complete" from the CLI is not the check (SN6 Resources/CLAUDE.md).
// After a hosting deploy succeeds, fetch what changed off the live host and
// compare it byte for byte with the commit.
export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError || !isHostingDeploy(e.command)) return ran
    if (!/Deploy complete/i.test(ran.text ?? '')) return ran

    const cwd = await $.session.cwd()
    if (!cwd.includes(SCOPE)) return ran

    let note: string
    try {
      note = await verify($, cwd)
    } catch (err) {
      note = `feb-deploy-verify could not run: ${String(err)}. Check the live host by hand.`
    }
    return { ...ran, context: [...(ran.context ?? []), note] }
  })
}

async function verify($: EngineInterface, cwd: string): Promise<string> {
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd })
  if (top.exitCode !== 0) return 'feb-deploy-verify: not in a git repo, skipped.'
  const root = top.stdout.trim()

  const head = (await $.process.run(['git', 'rev-parse', '--short', 'HEAD'], { cwd: root })).stdout.trim()
  const diff = await $.process.run(['git', 'diff', '--name-only', 'HEAD~1', 'HEAD', '--', PUBLIC], { cwd: root })
  const paths = filesToCheck(diff.exitCode === 0 ? diff.stdout : '', PUBLIC)

  const check = async (): Promise<FileCheck[]> => {
    const stamp = await $.clock.now()
    return Promise.all(paths.map(async rel => {
      const local = await $.fs.read(`${root}/${PUBLIC}${rel}`)
      const res = await $.http.fetch(`${HOST}/${rel}?verify=${stamp}`)
      return { rel, ok: res.ok, status: res.status, matches: res.ok && res.text === local, local, live: res.text }
    }))
  }

  // The CDN can lag a few seconds behind the CLI; one retry covers it.
  let results = await check()
  if (results.some(r => !r.matches)) {
    await $.clock.sleep(5000)
    results = await check()
  }

  const core = results.find(r => r.rel === 'core.js')
  const versions = core ? { local: versionIn(core.local), live: versionIn(core.live) } : undefined
  const { ok, text } = summarize(results, head, versions)
  $.ui.toast(ok ? `Deploy verified: ${results.length} file(s) live at ${head}` : 'Deploy NOT verified: live host differs')
  return text
}
