import { expect, test } from '@playwright/test'

const network = {
  version: 1,
  id: 'tv-remote-test',
  name: 'Remote Test Network',
  createdAt: 1,
  pin: null,
  channels: [
    { id: 'one', number: 1, name: 'First Channel', callsign: 'ONE', theme: 'test', look: 'gold', programs: [{ id: 'p-1', remoteId: 'r-1', source: 'archive', title: 'Show 1', durationSec: 3600, durationGuess: false }, { id: 'p-2', remoteId: 'r-2', source: 'archive', title: 'Show 2', durationSec: 3600, durationGuess: false }, { id: 'p-3', remoteId: 'r-3', source: 'archive', title: 'Show 3', durationSec: 3600, durationGuess: false }] },
    { id: 'two', number: 2, name: 'Second Channel', callsign: 'TWO', theme: 'test', look: 'blue', programs: [{ id: 'p-4', remoteId: 'r-4', source: 'archive', title: 'Show 4', durationSec: 3600, durationGuess: false }, { id: 'p-5', remoteId: 'r-5', source: 'archive', title: 'Show 5', durationSec: 3600, durationGuess: false }, { id: 'p-6', remoteId: 'r-6', source: 'archive', title: 'Show 6', durationSec: 3600, durationGuess: false }] },
  ],
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => console.log('TV PAGE ERROR:', error.stack || error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('TV CONSOLE ERROR:', message.text())
  })
  await page.addInitScript(({ network }) => {
    if (new URLSearchParams(location.search).get('nativeTest') === '1') {
      document.documentElement.dataset.tvApp = 'true'
    }
    // Make Cast availability deterministic in the browser test.
    ;(window as any).cast = { framework: { CastContext: { getInstance: () => ({
      setOptions() {},
      async requestSession() { return { async loadMedia() {} } },
    }) } } }
    ;(window as any).chrome = { cast: { AutoJoinPolicy: { ORIGIN_SCOPED: 'origin-scoped' } } }
    localStorage.setItem('blankbox:network:v1', JSON.stringify(network))
    localStorage.setItem('blankbox:prefs:v1', JSON.stringify({
      crt: false, aspect: '16:9', muted: true, volume: 0.7, rate: 1,
      logo: false, shake: false, guideScroll: false, favs: [], recent: [],
    }))
  }, { network })
  const response = await page.goto('/?tv=1&nativeTest=1')
  console.log('TV TEST PAGE:', response?.status(), await page.title(), (await page.locator('body').innerText()).slice(0, 500))
  await expect(page.getByTestId('tv-experience')).toBeVisible()
})

test('TV menu is a single remote-friendly column and D-pad selects actions', async ({ page }) => {
  await page.keyboard.press('Escape')
  const menu = page.getByTestId('tv-menu-overlay')
  await expect(menu).toBeVisible()
  await expect(page.getByTestId('tv-menu-return')).toBeFocused()

  await expect(page.getByTestId('cast-button')).toHaveCount(0)
  await expect(page.getByTestId('tv-menu-sound')).toContainText('SOUND ON')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('blankbox:prefs:v1') || '{}').muted)).toBe(false)
  await page.getByTestId('tv-menu-sound').click()
  await expect(page.getByTestId('tv-menu-sound')).toContainText('SOUND OFF')
  await page.getByTestId('tv-menu-volume-up').click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('blankbox:prefs:v1') || '{}').volume)).toBeGreaterThan(0.7)

  const buttons = menu.locator('.bb-tv-menu-actions button')
  await expect(buttons).toHaveCount(7)
  const positions = await buttons.evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect()
    return { left: rect.left, top: rect.top }
  }))
  expect(positions.every((position) => Math.abs(position.left - positions[0].left) < 2)).toBe(true)
  expect(positions.every((position, index) => index === 0 || position.top > positions[index - 1].top)).toBe(true)

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(buttons.nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
  await expect(page.getByTestId('builder')).toBeVisible()
})

test('guide D-pad changes the selected channel and OK tunes it', async ({ page }) => {
  await page.keyboard.press('Enter')
  const guide = page.getByTestId('tv-guide-overlay')
  await expect(guide).toBeVisible()
  const channelButtons = guide.getByTestId('tv-guide-channel')
  await expect(channelButtons).toHaveCount(2)
  const rowBoxes = await guide.getByTestId('tv-guide-rows').locator('.bb-tv-guide-row').evaluateAll((rows) =>
    rows.map((row) => row.getBoundingClientRect().height),
  )
  expect(rowBoxes[0]).toBeGreaterThan(100)
  expect(Math.abs(rowBoxes[0] - rowBoxes[1])).toBeLessThan(2)
  await expect(channelButtons.nth(0)).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(channelButtons.nth(1)).toBeFocused()
  await expect(channelButtons.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Enter')
  await expect(guide).toBeHidden()
  await expect(page.getByTestId('tv-live-lower-third')).toContainText('Second Channel')
})

test('guide Left/Right browse program blocks and page the timeline at its edge', async ({ page }) => {
  await expect(page.getByTestId('tv-experience')).toBeVisible()
  await page.keyboard.press('Enter')
  const guide = page.getByTestId('tv-guide-overlay')
  await expect(guide).toBeVisible()
  const firstRow = guide.locator('.bb-tv-guide-row').first()
  const programs = firstRow.getByTestId('tv-guide-program')
  await expect.poll(() => programs.count()).toBeGreaterThanOrEqual(3)
  await expect(firstRow.getByTestId('tv-guide-channel')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(programs.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(programs.nth(1)).toBeFocused()
  const firstTime = await guide.locator('.bb-tv-guide-time-cells > div').first().innerText()
  const lastProgram = programs.last()
  await lastProgram.focus()
  await page.keyboard.press('ArrowRight')
  await expect(firstRow.getByTestId('tv-guide-channel')).toBeFocused()
  await expect.poll(() => guide.locator('.bb-tv-guide-time-cells > div').first().innerText()).not.toBe(firstTime)
})


test('regular website uses the original Downloader receiver layout and remote-only Cast button', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.ok()).toBe(true)
  const receiver = page.getByTestId('web-tv-receiver')
  await expect(receiver).toBeVisible()
  await expect(page.locator('.bb-tv-header')).toBeVisible()
  await expect(page.locator('.bb-tv-broadcast')).toBeVisible()
  await expect(page.getByTestId('cable-remote')).toBeVisible()
  await expect(page.getByTestId('prevue-grid')).toBeVisible()
  await expect(page.locator('.bb-tv-main-grid')).toHaveCSS('display', 'grid')

  const picture = await page.locator('.bb-tv-screen-bezel').boundingBox()
  const remote = await page.getByTestId('cable-remote').boundingBox()
  const guide = await page.getByTestId('prevue-grid').boundingBox()
  expect(picture).not.toBeNull()
  expect(remote).not.toBeNull()
  expect(guide).not.toBeNull()
  expect(remote!.x).toBeGreaterThan(picture!.x)
  expect(guide!.y).toBeGreaterThan(picture!.y)

  // Give the active program a playable URL so the receiver's Cast action is mounted.
  await page.evaluate(() => {
    const key = 'blankbox:network:v1'
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    for (const channel of value.channels ?? []) {
      for (const program of channel.programs ?? []) program.playUrl = 'data:video/mp4;base64,AAAA'
    }
    localStorage.setItem(key, JSON.stringify(value))
  })
  await page.reload()
  const cast = page.getByTestId('cast-button')
  await expect(cast).toBeVisible()
  await expect(page.getByTestId('remote-cast-slot').getByTestId('cast-button')).toBeVisible()
  await expect(page.locator('.bb-tv-screen-inner [data-testid="cast-button"]')).toHaveCount(0)
  await expect(page.locator('.bb-tv-console [data-testid="cast-button"]')).toHaveCount(1)

  await page.goto('/?tv=1')
  await expect(page.getByTestId('web-tv-receiver')).toBeVisible()
})

test('the previous browser layout remains available by explicit opt-in', async ({ page }) => {
  const response = await page.goto('/?classic=1')
  expect(response?.ok()).toBe(true)
  await expect(page.locator('.bb-web-shell')).toBeVisible()
  await expect(page.locator('.bb-web-header')).toBeVisible()
  await expect(page.getByTestId('prevue-grid')).toBeVisible()
})
