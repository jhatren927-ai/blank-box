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
    // Make Cast availability deterministic in the browser test.
    ;(window as any).cast = { framework: { CastContext: { getInstance: () => ({
      setOptions() {},
      async requestSession() { return { async loadMedia() {} } },
    }) } } }
    ;(window as any).chrome ??= {}
    ;(window as any).chrome.cast = { AutoJoinPolicy: { ORIGIN_SCOPED: 'origin-scoped' } }
    if (!localStorage.getItem('blankbox:network:v1')) localStorage.setItem('blankbox:network:v1', JSON.stringify(network))
    if (!localStorage.getItem('blankbox:prefs:v1')) localStorage.setItem('blankbox:prefs:v1', JSON.stringify({
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

  const rowsViewport = guide.getByTestId('tv-guide-rows')
  const scrollBeforeSelection = await rowsViewport.evaluate((node) => node.scrollTop)
  await page.keyboard.press('ArrowDown')
  await expect(channelButtons.nth(1)).toBeFocused()
  await expect(channelButtons.nth(1)).toHaveAttribute('aria-pressed', 'true')
  // Selection changes cannot yank the automatically crawling lineup.
  await expect.poll(async () => Math.abs((await rowsViewport.evaluate((node) => node.scrollTop)) - scrollBeforeSelection)).toBeLessThan(20)
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
  await expect.poll(() => programs.count()).toBeGreaterThanOrEqual(2)
  await expect(guide.locator('.bb-tv-guide-time-cells > div')).toHaveCount(3)
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
  await expect(page.locator('.bb-tv-statusline, [data-testid="news-ticker"], .bb-tv-screen-heading, .bb-tv-osd')).toHaveCount(0)
  await expect(page.locator('.bb-tv-guide-section h2')).toHaveText('PREVUE')

  const picture = await page.locator('.bb-tv-screen-bezel').boundingBox()
  const remote = await page.getByTestId('cable-remote').boundingBox()
  const guide = await page.getByTestId('prevue-grid').boundingBox()
  expect(picture).not.toBeNull()
  expect(remote).not.toBeNull()
  expect(guide).not.toBeNull()
  expect(remote!.x).toBeGreaterThan(picture!.x)
  expect(guide!.y).toBeLessThan(picture!.y)
  expect(guide!.height).toBeGreaterThan(300)
  await expect(page.locator('.bb-station-strip')).toHaveCount(0)
  await expect(page.locator('[data-testid="guide-time-label"] + div > div')).toHaveCount(3)

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

test('iPhone Chrome opens the native AirPlay picker for the current video', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
    })
    ;(HTMLMediaElement.prototype as any).webkitShowPlaybackTargetPicker = function () {
      ;(window as any).__airplayPickerOpened = true
    }
  })
  await page.goto('/')
  await page.evaluate(() => {
    const key = 'blankbox:network:v1'
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    for (const channel of value.channels ?? []) {
      for (const program of channel.programs ?? []) program.playUrl = 'https://example.com/test.mp4'
    }
    localStorage.setItem(key, JSON.stringify(value))
  })
  await page.reload()
  const airplay = page.getByTestId('cast-button')
  await expect(airplay).toBeVisible()
  await expect(airplay).toContainText('AIRPLAY')
  await airplay.click()
  await expect(page.getByRole('status')).toContainText('Select your Apple TV')
  await expect.poll(() => page.evaluate(() => (window as any).__airplayPickerOpened)).toBe(true)
})

test('mobile website keeps the Prevue channel and time-slot matrix', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByTestId('prevue-grid')).toBeVisible()
  await expect(page.getByTestId('guide-viewport')).toBeVisible()
  await expect(page.getByTestId('guide-mobile-list')).toHaveCount(0)
  const timetable = page.locator('#guide > div:nth-child(2)')
  await expect.poll(() => timetable.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
})

test('web guide does not accept manual scrolling; only the automatic crawl moves its rows', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.ok()).toBe(true)
  await page.evaluate(() => {
    const key = 'blankbox:network:v1'
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    const source = value.channels?.[0]
    if (source) {
      value.channels = Array.from({ length: 30 }, (_, index) => ({
        ...source,
        id: 'fixed-' + index,
        number: index + 1,
        name: 'Fixed Channel ' + (index + 1),
        callsign: 'FX' + index,
        programs: (source.programs || []).map((program: any, programIndex: number) => ({
          ...program, id: 'fixed-' + index + '-program-' + programIndex,
        })),
      }))
      localStorage.setItem(key, JSON.stringify(value))
    }
  })
  await page.reload()
  const viewport = page.getByTestId('guide-viewport')
  await expect(viewport).toBeVisible()
  await expect(viewport).toHaveAttribute('aria-label', 'Automatically advancing television program guide')
  await expect(viewport).not.toHaveAttribute('tabindex', '0')
  await expect(viewport).toHaveCSS('overflow-y', 'hidden')

  // A wheel gesture cannot reposition the guide. A remote key can move focus
  // between guide entries, but cannot use the viewport as a scroll control.
  const wheel = await viewport.evaluate((node) => {
    const before = node.scrollTop
    node.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 900 }))
    return { before, after: node.scrollTop }
  })
  expect(wheel.after).toBe(wheel.before)

  await viewport.locator('[data-testid="guide-tune"]').first().focus()
  const beforeKey = await viewport.evaluate((node) => node.scrollTop)
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBe(beforeKey)
})

test('remote channel rockers use concise 90s-style labels', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('tv-channel-up')).toHaveAttribute('aria-label', 'Channel up')
  await expect(page.getByTestId('tv-channel-down')).toHaveAttribute('aria-label', 'Channel down')
  await expect(page.getByTestId('tv-channel-up')).toContainText('CH +')
  await expect(page.getByTestId('tv-channel-down')).toContainText('CH −')
  await expect(page.getByTestId('tv-channel-up')).not.toContainText('CHANNEL')
  await expect(page.getByTestId('tv-channel-down')).not.toContainText('CHANNEL')
})

test('receiver edit key opens the currently tuned channel editor', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('tv-edit-channel')).toBeEnabled()
  await page.getByTestId('tv-edit-channel').click()
  await expect(page.getByTestId('builder')).toBeVisible()
})

test('the previous browser layout remains available by explicit opt-in', async ({ page }) => {
  const response = await page.goto('/?classic=1')
  expect(response?.ok()).toBe(true)
  await expect(page.locator('.bb-web-shell')).toBeVisible()
  await expect(page.locator('.bb-web-header')).toBeVisible()
  await expect(page.getByTestId('prevue-grid')).toBeVisible()
})

test('website removes forced sign-in and saves a channel before videos are added', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.ok()).toBe(true)
  await expect(page.getByText('Private access')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)

  const addChannel = page.getByTestId('guide-add-channel')
  await expect(addChannel).toBeVisible()
  await expect(addChannel).toBeInViewport()
  await expect(page.locator('.bb-receiver-logo')).toHaveCount(0)
  await addChannel.click()

  await expect(page.getByTestId('builder')).toBeVisible()
  await page.getByTestId('theme-input').fill('Local News')
  await page.getByTestId('make-channel').click()
  await expect(page.getByTestId('channel-name')).not.toHaveValue('')
  await expect(page.getByTestId('watch-channel')).toContainText('Save channel')
  await page.getByTestId('watch-channel').click()

  await expect(page.getByTestId('web-tv-receiver')).toBeVisible()
  const guideRows = page.locator('[data-testid="guide-row"]')
  await expect(guideRows).toHaveCount(3)
  await expect(guideRows.filter({ hasText: /local news/i })).toBeVisible()

  await page.reload()
  const persistedGuideRows = page.locator('[data-testid="guide-row"]')
  await expect(persistedGuideRows).toHaveCount(3)
  await expect(persistedGuideRows.filter({ hasText: /local news/i })).toBeVisible()
})


test('web Prevue guide automatically crawls upward through all channels', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    const key = 'blankbox:network:v1'
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    const source = value.channels?.[0]
    if (source) {
      value.channels = Array.from({ length: 30 }, (_, index) => ({
        ...source,
        id: 'crawl-' + index,
        number: index + 1,
        name: 'Crawl Channel ' + (index + 1),
        callsign: 'CR' + index,
        programs: (source.programs || []).map((program: any, programIndex: number) => ({
          ...program, id: 'crawl-' + index + '-program-' + programIndex,
        })),
      }))
      localStorage.setItem(key, JSON.stringify(value))
    }
  })
  await page.reload()
  const viewport = page.getByTestId('guide-viewport')
  await expect(viewport).toBeVisible()
  await expect(page.locator('[data-testid="guide-row"]')).toHaveCount(30)
  await expect(page.locator('[data-testid="guide-auto-scroll"] > div')).toHaveCount(2)
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop), { timeout: 4000 }).toBeGreaterThan(0)
})

test('native TV Prevue guide automatically crawls the complete channel lineup', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'blankbox:network:v1'
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    const source = value.channels?.[0]
    if (source) {
      value.channels = Array.from({ length: 18 }, (_, index) => ({
        ...source,
        id: 'native-crawl-' + index,
        number: index + 1,
        name: 'Native Crawl ' + (index + 1),
        callsign: 'NC' + index,
        programs: (source.programs || []).map((program: any, programIndex: number) => ({
          ...program, id: 'native-crawl-' + index + '-program-' + programIndex,
        })),
      }))
      localStorage.setItem(key, JSON.stringify(value))
    }
  })
  await page.reload()
  await expect(page.getByTestId('tv-experience')).toBeVisible()
  await page.keyboard.press('Enter')
  const guide = page.getByTestId('tv-guide-overlay')
  await expect(guide).toBeVisible()
  const rows = guide.getByTestId('tv-guide-rows')
  await expect(guide.getByTestId('tv-guide-channel')).toHaveCount(18)
  await expect(guide.getByTestId('tv-guide-auto-scroll').locator('.bb-tv-guide-crawl-copy')).toHaveCount(2)
  await expect.poll(() => rows.evaluate((node) => node.scrollTop), { timeout: 4000 }).toBeGreaterThan(0)
})
