// Pure checks, no `$`, so the tests can drive them directly.
// Each returns the reason to refuse, or undefined to let the command through.

export type Overrides = { nonHostingDeploy: boolean }

// Split a shell command into simple commands and those into words. Rough on
// purpose: it handles quotes and the usual separators, not every corner of sh.
export function segments(command: string): string[][] {
  const out: string[][] = []
  let words: string[] = []
  let word = ''
  let hasWord = false
  let quote: '"' | "'" | null = null

  const endWord = () => {
    if (hasWord) words.push(word)
    word = ''
    hasWord = false
  }
  const endSegment = () => {
    endWord()
    if (words.length) out.push(words)
    words = []
  }

  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < command.length) word += command[++i]!
      else word += c
      continue
    }
    if (c === '"' || c === "'") { quote = c; hasWord = true; continue }
    if (c === '\\' && i + 1 < command.length) { word += command[++i]!; hasWord = true; continue }
    if (c === ';' || c === '\n' || c === '|' || c === '&' || c === '(' || c === ')') { endSegment(); continue }
    if (c === ' ' || c === '\t') { endWord(); continue }
    word += c
    hasWord = true
  }
  endSegment()
  return out
}

// Drop leading env assignments and wrappers so `FOO=1 npx firebase deploy`
// reads as `firebase deploy`.
function strip(words: string[]): string[] {
  let i = 0
  while (i < words.length && (/^\w+=/.test(words[i]!) || ['npx', 'command', 'exec', 'time', 'sudo', 'env'].includes(words[i]!))) i++
  return words.slice(i)
}

// `git -C dir push` and `git --no-pager tag` still count as push and tag.
function gitSub(words: string[]): { sub: string; args: string[] } | undefined {
  if (words[0] !== 'git') return undefined
  let i = 1
  while (i < words.length && words[i]!.startsWith('-')) {
    if (words[i] === '-C' || words[i] === '-c') i++
    i++
  }
  return i < words.length ? { sub: words[i]!, args: words.slice(i + 1) } : undefined
}

const HOW_RELEASE = 'Releases go through `node tools/release.mjs <version>` from the repo root (CLAUDE.md, "One version, one release").'

export function checkFirebase(args: string[], o: Overrides): string | undefined {
  if (args[0] !== 'deploy') return undefined
  let only: string | undefined
  for (let i = 1; i < args.length; i++) {
    const a = args[i]!
    if (a === '--only') only = args[i + 1]
    else if (a.startsWith('--only=')) only = a.slice(7)
  }
  if (only === undefined) {
    return 'A bare `firebase deploy` also ships firestore.rules, storage.rules and functions. The standing authorization covers `firebase deploy --only hosting` and nothing else.'
  }
  const targets = only.split(',').map(t => t.trim()).filter(Boolean)
  const others = targets.filter(t => t !== 'hosting' && !t.startsWith('hosting:'))
  if (others.length && !o.nonHostingDeploy) {
    return `\`--only ${only}\` deploys ${others.join(', ')}. Rules can lock the team out of their own data and functions are deployed separately on purpose, so this needs Simon: ask him, and if he agrees he types "allow rules deploy" (or "allow functions deploy") in his next message.`
  }
  return undefined
}

export function checkGit(sub: string, args: string[]): string | undefined {
  if (sub === 'tag' && args.some(a => a.startsWith('addin-v'))) {
    return `There is no separate add-in version and no \`addin-v*\` tag. ${HOW_RELEASE}`
  }

  if (sub === 'remote' && (args[0] === 'add' || args[0] === 'set-url') && args.some(isSsh)) {
    return 'Keep the remote on HTTPS. The SSH key on this machine authenticates as `starbuckgold`, but the repo belongs to `Jinxiewinx` (the gh account).'
  }

  if (sub !== 'push') return undefined
  if (args.some(isSsh)) {
    return 'Push over HTTPS. The SSH key on this machine authenticates as `starbuckgold`, not `Jinxiewinx`.'
  }
  if (args.some(a => a.includes('addin-v'))) {
    return `There is no separate add-in version and no \`addin-v*\` tag. ${HOW_RELEASE}`
  }

  const flagForce = args.some(a => a === '-f' || a === '--force' || a.startsWith('--force-with-lease') || a.startsWith('--force-if-includes') || (/^-[a-zA-Z]+$/.test(a) && a.includes('f')))
  const positional = args.filter(a => !a.startsWith('-'))
  const refspecs = positional.slice(1)
  const plusForce = refspecs.some(r => r.startsWith('+'))
  if (!flagForce && !plusForce) return undefined

  const dst = (r: string) => {
    const s = r.replace(/^\+/, '')
    const d = s.includes(':') ? s.split(':')[1] : s
    return (d ?? '').replace(/^refs\/heads\//, '')
  }
  const hitsMain = refspecs.length === 0 || refspecs.some(r => ['main', 'master', 'HEAD'].includes(dst(r)))
  if (hitsMain || args.includes('--all') || args.includes('--mirror')) {
    return 'No force-push over real history on main (SN6 Resources/CLAUDE.md). If history really needs rewriting, that is a call for Simon to make and run himself.'
  }
  return undefined
}

function isSsh(a: string): boolean {
  return /^git@github\.com:/.test(a) || /^ssh:\/\//.test(a)
}

const VERSION_TOKENS = /ADDIN_VERSION|APP_VERSION|FEBPlanStock\.manifest/

function checkInPlaceEdit(words: string[]): string | undefined {
  const tool = words[0]
  const inPlace = (tool === 'sed' && words.some(w => /^-[a-zA-Z]*i/.test(w) || w === '--in-place' || w.startsWith('--in-place=')))
    || (tool === 'perl' && words.some(w => /^-[a-zA-Z]*i/.test(w)))
  if (inPlace && words.some(w => VERSION_TOKENS.test(w))) {
    return `Version strings are written only by the release script, which keeps APP_VERSION, the add-in manifest and ADDIN_VERSION in step. ${HOW_RELEASE}`
  }
  return undefined
}

export function checkBash(command: string, o: Overrides): string | undefined {
  for (const raw of segments(command)) {
    const words = strip(raw)
    if (!words.length) continue
    let reason: string | undefined
    if (words[0] === 'firebase') reason = checkFirebase(words.slice(1), o)
    else if (words[0] === 'gh' && words[1] === 'release' && ['create', 'upload', 'delete', 'edit'].includes(words[2] ?? '')) {
      reason = `\`gh release ${words[2]}\` by hand is off: the release script publishes the Release with the add-in zip attached. ${HOW_RELEASE}`
    } else {
      const git = gitSub(words)
      if (git) reason = checkGit(git.sub, git.args)
      else reason = checkInPlaceEdit(words)
    }
    if (reason) return reason
  }
  return undefined
}

// True when the command is a hosting deploy that should then be checked for a
// pushed tree. Separate from checkBash because that check needs git.
export function isHostingDeploy(command: string): boolean {
  return segments(command).some(raw => {
    const w = strip(raw)
    if (w[0] !== 'firebase' || w[1] !== 'deploy') return false
    const i = w.findIndex(a => a === '--only' || a.startsWith('--only='))
    if (i < 0) return false
    const flag = w[i]!
    const only = flag.startsWith('--only=') ? flag.slice(7) : w[i + 1] ?? ''
    return only.split(',').some(t => t === 'hosting' || t.startsWith('hosting:'))
  })
}

// Edit/Write on the three files that carry the version. Returns the reason
// when the change touches a version line.
export const VERSION_FILES: { suffix: string; line: RegExp }[] = [
  { suffix: '06 Composites App/app/core.js', line: /\bAPP_VERSION\s*=\s*["'][^"']*["']/ },
  { suffix: 'FEBPlanStock/FEBPlanStock.manifest', line: /"version"\s*:\s*"[^"]*"/ },
  { suffix: 'FEBPlanStock/FEBPlanStock.py', line: /\bADDIN_VERSION\s*=\s*["'][^"']*["']/ },
]

export function versionFile(path: string) {
  return VERSION_FILES.find(f => path.endsWith(f.suffix))
}

export function versionOf(text: string, line: RegExp): string | undefined {
  return text.match(line)?.[0]
}

export function checkVersionEdit(path: string, before: string, after: string): string | undefined {
  const f = versionFile(path)
  if (!f) return undefined
  if (versionOf(before, f.line) !== versionOf(after, f.line)) {
    return `This changes the version line in ${f.suffix}. ${HOW_RELEASE} tools/test_addin_package.mjs fails when the three version strings drift.`
  }
  return undefined
}

export function wantsNonHosting(prompt: string): boolean {
  return /\ballow (rules|firestore|storage|functions) deploy\b/i.test(prompt)
}
