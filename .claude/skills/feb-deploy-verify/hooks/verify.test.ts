import { expect, test } from 'claude-code/testing'

import { filesToCheck, isHostingDeploy, summarize, versionIn } from './verify'

const PUB = '06 Composites App/app/'

test('core.js is always checked, changed text files follow, binaries and dotfiles are skipped', () => {
  const diff = [`${PUB}views/budget.js`, `${PUB}fonts/x.woff2`, `${PUB}.hidden.js`, `${PUB}core.js`, 'tools/test_app.mjs'].join('\n')
  expect(filesToCheck(diff, PUB)).toEqual(['core.js', 'views/budget.js'])
  expect(filesToCheck('', PUB)).toEqual(['core.js'])
})

test('hosting deploy detection', () => {
  expect(isHostingDeploy('cd "06 Composites App" && firebase deploy --only hosting')).toBe(true)
  expect(isHostingDeploy('firebase deploy --only firestore:rules')).toBe(false)
})

test('version is read off core.js', () => {
  expect(versionIn('var APP_VERSION = "6.2.0";')).toBe('6.2.0')
})

test('summary says not verified when a file differs', () => {
  const r = summarize([
    { rel: 'core.js', ok: true, status: 200, matches: true, local: '', live: '' },
    { rel: 'views/budget.js', ok: true, status: 200, matches: false, local: 'a', live: 'b' },
  ], 'abc1234')
  expect(r.ok).toBe(false)
  expect(r.text).toContain('does NOT match')
  expect(r.text).toContain('views/budget.js')
})
