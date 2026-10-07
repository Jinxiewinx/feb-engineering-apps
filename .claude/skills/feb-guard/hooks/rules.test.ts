import { describe, expect, test } from 'claude-code/testing'

import { checkBash, checkVersionEdit, isHostingDeploy, wantsNonHosting } from './rules'

const off = { nonHostingDeploy: false }
const on = { nonHostingDeploy: true }
const blocked = (cmd: string, o = off) => checkBash(cmd, o) !== undefined

describe('firebase deploy', () => {
  test('hosting only passes', () => {
    expect(blocked('cd "SN6 Resources/06 Composites App" && firebase deploy --only hosting')).toBe(false)
    expect(blocked('npx firebase deploy --only=hosting')).toBe(false)
  })
  test('bare deploy is blocked even with the override', () => {
    expect(blocked('firebase deploy')).toBe(true)
    expect(blocked('firebase deploy', on)).toBe(true)
  })
  test('rules and functions need the override', () => {
    expect(blocked('firebase deploy --only firestore:rules')).toBe(true)
    expect(blocked('firebase deploy --only hosting,storage')).toBe(true)
    expect(blocked('firebase deploy --only functions')).toBe(true)
    expect(blocked('firebase deploy --only firestore:rules', on)).toBe(false)
  })
  test('other firebase commands pass', () => {
    expect(blocked('firebase emulators:exec "node tools/test_wo_rules.mjs"')).toBe(false)
  })
  test('hosting deploy is recognised for the pushed-tree check', () => {
    expect(isHostingDeploy('firebase deploy --only hosting')).toBe(true)
    expect(isHostingDeploy('firebase deploy --only firestore:rules')).toBe(false)
  })
})

describe('releases', () => {
  test('gh release by hand is blocked, reading one is not', () => {
    expect(blocked('gh release create v6.3.0 dist/FEBPlanStock-6.3.0.zip')).toBe(true)
    expect(blocked('gh release upload v6.2.0 x.zip')).toBe(true)
    expect(blocked('gh release view v6.2.0')).toBe(false)
  })
  test('addin tags are blocked', () => {
    expect(blocked('git tag addin-v1.2.0')).toBe(true)
    expect(blocked('git push origin addin-v1.2.0')).toBe(true)
    expect(blocked('git tag v6.3.0')).toBe(false)
  })
  test('the release script itself passes', () => {
    expect(blocked('node tools/release.mjs 6.3.0')).toBe(false)
  })
  test('sed on version strings is blocked, reading them is not', () => {
    expect(blocked(`sed -i '' 's/APP_VERSION = "6.2.0"/APP_VERSION = "6.3.0"/' "06 Composites App/app/core.js"`)).toBe(true)
    expect(blocked('grep -n APP_VERSION "06 Composites App/app/core.js"')).toBe(false)
    expect(blocked(`sed -n 1,40p "10 Fusion Add-in/FEBPlanStock/FEBPlanStock.manifest"`)).toBe(false)
  })
})

describe('git push', () => {
  test('ordinary pushes pass', () => {
    expect(blocked('git push')).toBe(false)
    expect(blocked('git push origin main --tags')).toBe(false)
    expect(blocked('git push -u origin feature-x')).toBe(false)
  })
  test('force on main is blocked', () => {
    expect(blocked('git push --force')).toBe(true)
    expect(blocked('git push -f origin main')).toBe(true)
    expect(blocked('git push origin +main')).toBe(true)
    expect(blocked('git -C "SN6 Resources" push --force-with-lease origin HEAD:main')).toBe(true)
  })
  test('force on a named side branch passes', () => {
    expect(blocked('git push --force-with-lease origin worktree-agent-x')).toBe(false)
  })
  test('ssh is blocked', () => {
    expect(blocked('git remote set-url origin git@github.com:Jinxiewinx/feb-engineering-apps.git')).toBe(true)
    expect(blocked('git push git@github.com:Jinxiewinx/feb-engineering-apps.git main')).toBe(true)
  })
  test('commit messages that merely mention things pass', () => {
    expect(blocked(`git commit -m "Never run firebase deploy bare; gh release create is release.mjs's job"`)).toBe(false)
  })
})

describe('version edits', () => {
  const core = '/x/composites_programs/SN6 Resources/06 Composites App/app/core.js'
  const py = '/x/composites_programs/SN6 Resources/10 Fusion Add-in/FEBPlanStock/FEBPlanStock.py'
  test('changing the version line is blocked', () => {
    expect(checkVersionEdit(core, 'var APP_VERSION = "6.2.0";', 'var APP_VERSION = "6.3.0";')).toBeDefined()
    expect(checkVersionEdit(py, "ADDIN_VERSION = '6.2.0'", "ADDIN_VERSION = '6.2.1'")).toBeDefined()
  })
  test('other edits to the same files pass', () => {
    expect(checkVersionEdit(core, 'function a() {}', 'function b() {}')).toBeUndefined()
    expect(checkVersionEdit('/x/other.js', 'APP_VERSION = "1"', 'APP_VERSION = "2"')).toBeUndefined()
  })
})

test('the override phrase is explicit', () => {
  expect(wantsNonHosting('allow rules deploy')).toBe(true)
  expect(wantsNonHosting("don't deploy rules")).toBe(false)
})
