import { expect, test } from '@playwright/test'

const network = {
  version: 1,
  id: 'tv-remote-test',
  name: 'Remote Test Network',
  createdAt: 1,
  pin: null,
  channels: [
    { id: 'one', number: 1, name: 'First Channel', callsign: 'ONE', theme: 'test', look: 'gold', programs: [] },
    { id: 'two', number: 2, name: 'Second Channel', callsign: 'TWO', theme: 'test', look: 'blue', programs: [] },
  ],
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => console.log('TV PAGE ERROR:', error.stack || error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('TV CONSOLE ERROR:', message.text())
  })
  await page.addInitScript(({ network }) => {
    localStorage.setItem('blankbox:network:v1', JSON.stringify(network))
    localStorage.setItem('blankbox:prefs:v1', JSON.stringify({
      crt: false, aspect: '16:9', muted: true, volume: 0.7, rate: 1,
      logo: false, shake: false, guideScroll: false, favs: [], recent: [],
    }))
  }, { network })
  const response = await page.goto('/?tv=1')
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

test('guide left and right move across program listings instead of changing the time page', async ({ page }) => {
  const listing = {
    ...network,
    channels: network.channels.map((channel, channelIndex) => ({
      ...channel,
      programs: Array.from({ length: 3 }, (_, index) => ({
        id: `p-${channelIndex}-${index}`,
        remoteId: `r-${channelIndex}-${index}`,
        source: 'archive',
        title: `Channel ${channelIndex + 1} Show ${index + 1}`,
        durationSec: 3600,
        durationGuess: false,
      })),
    })),
  }
  await page.addInitScript((value) => {
    localStorage.setItem('blankbox:network:v1', JSON.stringify(value))
    const prefs = JSON.parse(localStorage.getItem('blankbox:prefs:v1') || '{}')
    prefs.muted = false
    localStorage.setItem('blankbox:prefs:v1', JSON.stringify(prefs))
    localStorage.setItem('blankbox:audio-default-v2', '1')
  }, listing)
  await page.reload()
  await expect(page.getByTestId('tv-experience')).toBeVisible()
  await page.keyboard.press('Enter')
  const guide = page.getByTestId('tv-guide-overlay')
  await expect(guide).toBeVisible()
  const firstRow = guide.locator('.bb-tv-guide-row').first()
  const programs = firstRow.getByTestId('tv-guide-program')
  await expect(programs).toHaveCount(3)
  await expect(firstRow.getByTestId('tv-guide-channel')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(programs.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(programs.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(programs.nth(2)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(programs.nth(1)).toBeFocused()
})
