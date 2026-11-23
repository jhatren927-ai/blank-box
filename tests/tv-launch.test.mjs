import test from 'node:test'
import assert from 'node:assert/strict'
import { enableTvLaunch } from '../scripts/tv-launch.mjs'

test('native APK bootstrap marks the document for TV mode before app startup', () => {
  const html = '<!doctype html><html><head><title>Blank Box</title></head><body></body></html>'
  const result = enableTvLaunch(html)
  assert.match(result, /document\.documentElement\.dataset\.tvApp = "true"/)
  assert.ok(result.indexOf('dataset.tvApp') < result.indexOf('</head>'))
})

test('native APK bootstrap is idempotent', () => {
  const html = '<html><head></head><body></body></html>'
  const once = enableTvLaunch(html)
  const twice = enableTvLaunch(once)
  assert.equal(twice, once)
})
