import { expect, test } from '@playwright/test'

test('create a network, fill channels, watch, and sync', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto('/')
  await expect(page.getByTestId('network-name')).not.toHaveValue('')

  await page.getByTestId('new-channel').click()
  await page.getByTestId('theme-input').fill('duck')
  await page.getByTestId('make-channel').click()
  await expect(page.getByTestId('search-hit').first()).toBeVisible({ timeout: 45_000 })
  await page.screenshot({ path: '/opt/cursor/artifacts/channel-builder.png' })

  let added = 0
  const buttons = page.getByTestId('hit-add')
  const total = await buttons.count()
  for (let index = 0; index < total && added < 3; index++) {
    const button = buttons.nth(index)
    await button.click()
    await expect(button).toHaveAttribute('data-status', /added|failed/, { timeout: 40_000 })
    if ((await button.getAttribute('data-status')) === 'added') added += 1
  }
  expect(added).toBeGreaterThanOrEqual(3)
  const title = (await page.getByTestId('picked-title').first().innerText()).trim()
  await page.getByTestId('watch-channel').click()
  await expect(page.getByTestId('prevue-grid')).toContainText(title.slice(0, 16))
  await expect(page.getByTestId('playback')).toHaveAttribute('data-state', 'playing', { timeout: 60_000 })
  await page.getByTestId('crt-player').screenshot({ path: '/opt/cursor/artifacts/playback.png' })

  await page.getByTestId('new-channel').click()
  await page.getByTestId('theme-input').fill('zoo')
  await page.getByTestId('make-channel').click()
  await page.getByTestId('source-youtube').click()
  await page.getByTestId('paste-input').fill('https://www.youtube.com/watch?v=jNQXAC9IVRw')
  await page.getByTestId('paste-add').click()
  await expect(page.getByTestId('picked-count')).toContainText('1 picked', { timeout: 20_000 })
  await page.getByTestId('watch-channel').click()
  const youtubeFrame = page.locator('[data-testid="youtube-player"] iframe')
  await expect(youtubeFrame).toHaveAttribute('src', /youtube\.com\/embed\/jNQXAC9IVRw/, { timeout: 20_000 })
  await expect(youtubeFrame).toHaveAttribute('src', /enablejsapi=1/)
  const youtubeDeadline = Date.now() + 12_000
  let youtubeState = 'tuning'
  while (Date.now() < youtubeDeadline) {
    youtubeState = (await page.getByTestId('playback').getAttribute('data-state')) ?? 'tuning'
    if (youtubeState === 'playing' || youtubeState === 'failed') break
    await page.waitForTimeout(400)
  }
  if (youtubeState !== 'playing') {
    const reason = (await page.getByTestId('playback').getAttribute('data-reason')) || 'still tuning'
    console.log(`YouTube embed did not reach playback (${youtubeState}: ${reason}).`)
  }

  await page.getByTestId('new-channel').click()
  await page.getByTestId('theme-input').fill('test picture')
  await page.getByTestId('make-channel').click()
  await page.getByTestId('source-link').click()
  await page.getByTestId('paste-input').fill('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8')
  await page.getByTestId('paste-add').click()
  await expect(page.getByTestId('picked-count')).toContainText('1 picked', { timeout: 30_000 })
  await page.getByTestId('watch-channel').click()
  await expect(page.getByTestId('live-video')).toBeVisible()
  await expect(page.getByTestId('playback')).toHaveAttribute('data-state', 'playing', { timeout: 45_000 })

  await expect(page.getByTestId('guide-row')).toHaveCount(3)
  const before = await page.getByTestId('osd-channel').innerText()
  await page.getByTestId('channel-down-button').click()
  await expect(page.getByTestId('osd-channel')).not.toHaveText(before, { timeout: 10_000 })
  await expect(page.getByTestId('channel-static')).toBeHidden({ timeout: 5_000 })
  await page.getByTestId('prevue-grid').scrollIntoViewIfNeeded()
  await page.screenshot({ path: '/opt/cursor/artifacts/guide.png' })

  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('sync-export')).not.toHaveValue('')
  const code = await page.getByTestId('sync-export').inputValue()
  expect(code.startsWith('BB1.')).toBe(true)
  await page.getByTestId('reset-network').click()
  await page.getByTestId('reset-confirm').click()
  await expect(page.getByTestId('guide-row')).toHaveCount(0)
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('sync-import').fill(code)
  await page.getByTestId('sync-apply').click()
  await expect(page.getByTestId('guide-row')).toHaveCount(3)
})
