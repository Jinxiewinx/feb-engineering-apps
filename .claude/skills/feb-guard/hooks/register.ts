import type { EngineInterface, Register } from 'claude-code'

import { checkBash, checkVersionEdit, isHostingDeploy, versionFile, wantsNonHosting } from './rules'

// Only this project's sessions are guarded.
const SCOPE = '/composites_programs/'
const APP_DIR = '06 Composites App'

export const register: Register = on => {
  // Set per prompt: Simon typing "allow rules deploy" lifts the hosting-only
  // rule for the rest of that turn and no longer.
  let nonHostingDeploy = false

  on('prompt.submit', ($, e, next) => {
    nonHostingDeploy = wantsNonHosting(e.text)
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const cwd = await $.session.cwd()
    if (!cwd.includes(SCOPE)) return next(e)

    const reason = checkBash(e.command, { nonHostingDeploy })
    if (reason) return refuse($, reason)

    if (isHostingDeploy(e.command)) {
      const unpushed = await unpushedState($, cwd)
      if (unpushed) return refuse($, unpushed)
    }

    return next(e)
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    if (!e.file_path.includes(SCOPE) || !versionFile(e.file_path)) return next(e)
    const reason = checkVersionEdit(e.file_path, e.old_string, e.new_string)
    return reason ? refuse($, reason) : next(e)
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    if (!e.file_path.includes(SCOPE) || !versionFile(e.file_path)) return next(e)
    const before = (await $.fs.exists(e.file_path)) ? await $.fs.read(e.file_path) : ''
    const reason = checkVersionEdit(e.file_path, before, e.content)
    return reason ? refuse($, reason) : next(e)
  })
}

function refuse($: EngineInterface, reason: string) {
  $.ui.toast('feb-guard blocked a command')
  return { deny: `feb-guard: ${reason}` }
}

// "Deploy from a state that is pushed, so live always matches a commit."
async function unpushedState($: EngineInterface, cwd: string): Promise<string | undefined> {
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd })
  if (top.exitCode !== 0) return undefined
  const root = top.stdout.trim()

  const dirty = await $.process.run(['git', 'status', '--porcelain', '--', APP_DIR], { cwd: root })
  if (dirty.exitCode === 0 && dirty.stdout.trim()) {
    return `${APP_DIR} has uncommitted changes, so what goes live would match no commit. Commit and push first, then deploy.\n${dirty.stdout.trim()}`
  }

  const ahead = await $.process.run(['git', 'rev-list', '--count', '@{u}..HEAD'], { cwd: root })
  if (ahead.exitCode === 0 && Number(ahead.stdout.trim()) > 0) {
    return `${ahead.stdout.trim()} commit(s) are not pushed yet. Push first, deploy second, so live always matches a commit on GitHub.`
  }
  return undefined
}
