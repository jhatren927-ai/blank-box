import { mkdirSync, writeFileSync } from 'node:fs'
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
    // Capture the first complete public receiver frame, not the empty root
    // insertion. Native-test pages have a different full-screen composition.
    const firstFrameObserver = new MutationObserver(() => {
      const root = document.getElementById('root')
      if (!root?.firstElementChild) return

      if (new URLSearchParams(window.location.search).get('nativeTest') === '1') {
        ;(window as any).__bbFirstFrameTheme = {
          tvMode: document.documentElement.classList.contains('tv-mode'),
        }
        firstFrameObserver.disconnect()
        return
      }

      const header = document.querySelector('.bb-tv-header')
      const appRoot = document.querySelector('.bb-app-root')
      const programTitle = document.querySelector('.bb-tv-guide-section .bb-guide-program-cell p:first-child')
      const screen = document.querySelector('.bb-tv-screen-bezel')
      const remote = document.querySelector('.bb-cable-receiver')
      if (!header || !appRoot || !programTitle || !screen || !remote) return

      ;(window as any).__bbFirstFrameTheme = {
        tvMode: document.documentElement.classList.contains('tv-mode'),
        headerBackground: getComputedStyle(header).backgroundImage,
        appBackground: getComputedStyle(appRoot).backgroundImage,
        screenBackground: getComputedStyle(screen).backgroundImage,
        remoteBackground: getComputedStyle(remote).backgroundImage,
        programTitleSize: getComputedStyle(programTitle).fontSize,
      }
      firstFrameObserver.disconnect()
    })
    firstFrameObserver.observe(document, { childList: true, subtree: true })
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
  const firstFrameTheme = await page.evaluate(() => (window as any).__bbFirstFrameTheme)
  expect(firstFrameTheme?.tvMode).toBe(true)
  expect(firstFrameTheme?.headerBackground).toContain('linear-gradient')
  expect(firstFrameTheme?.headerBackground).toContain('rgb(29, 74, 131)')
  expect(firstFrameTheme?.appBackground).toContain('radial-gradient')
  expect(firstFrameTheme?.screenBackground).toContain('linear-gradient')
  expect(firstFrameTheme?.screenBackground).toContain('rgb(40, 85, 143)')
  expect(firstFrameTheme?.remoteBackground).toContain('linear-gradient')
  expect(firstFrameTheme?.remoteBackground).toContain('rgb(40, 85, 143)')
  expect(firstFrameTheme?.programTitleSize).toBe('14px')
  await expect(page.locator('.bb-tv-broadcast')).toBeVisible()
  await expect(page.getByTestId('cable-remote')).toBeVisible()
  await expect(page.locator('.bb-tv-dial')).toHaveCount(0)
  await expect(page.getByTestId('prevue-grid')).toBeVisible()
  await expect(page.locator('.bb-tv-main-grid')).toHaveCSS('display', 'grid')
  await expect(page.locator('.bb-tv-statusline, [data-testid="news-ticker"], .bb-tv-screen-heading, .bb-tv-osd')).toHaveCount(0)
  await expect(page.locator('.bb-tv-guide-section h2')).toHaveText('PREVUE')

  const selectedChannel = page.locator('.bb-tv-guide-section .bb-guide-channel-button.bg-yellow-400').first()
  await expect(selectedChannel).toBeVisible()
  const selectedTextColors = await selectedChannel.locator('span').evaluateAll((spans) =>
    spans.map((span) => getComputedStyle(span).color),
  )
  expect(selectedTextColors).toEqual(['rgb(7, 27, 66)', 'rgb(7, 27, 66)', 'rgb(7, 27, 66)'])

  const picture = await page.locator('.bb-tv-screen-bezel').boundingBox()
  const remote = await page.getByTestId('cable-remote').boundingBox()
  const guide = await page.getByTestId('prevue-grid').boundingBox()
  expect(picture).not.toBeNull()
  expect(remote).not.toBeNull()
  expect(guide).not.toBeNull()
  expect(remote!.x).toBeGreaterThan(picture!.x)
  expect(guide!.y).toBeGreaterThan(picture!.y)
  expect(guide!.height).toBeGreaterThan(300)
  await expect(page.locator('.bb-station-strip')).toHaveCount(0)
  await expect(page.locator('[data-testid="guide-time-label"] + div > div')).toHaveCount(3)

  // Give the active program a playable URL so the receiver's Cast action is mounted.
  await page.evaluate(() => {
    const key = 'blankbox:network:v1'
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    for (const channel of value.channels ?? []) {
      for (const program of channel.programs ?? []) program.playUrl = 'https://example.com/test.mp4'
    }
    localStorage.setItem(key, JSON.stringify(value))
  })
  await page.reload()
  const cast = page.getByTestId('cast-button')
  await expect(cast).toBeVisible()
  await expect(page.getByTestId('remote-cast-slot').getByTestId('cast-button')).toBeVisible()
  const remoteBounds = await page.getByTestId('cable-remote').boundingBox()
  const castBounds = await page.getByTestId('remote-cast-slot').boundingBox()
  expect(remoteBounds).not.toBeNull()
  expect(castBounds).not.toBeNull()
  const remoteBottom = remoteBounds!.y + remoteBounds!.height
  const castBottom = castBounds!.y + castBounds!.height
  expect(remoteBottom - castBottom).toBeGreaterThanOrEqual(0)
  expect(remoteBottom - castBottom).toBeLessThanOrEqual(20)
  await expect(page.locator('.bb-tv-screen-inner [data-testid="cast-button"]')).toHaveCount(0)
  await expect(page.locator('.bb-tv-console [data-testid="cast-button"]')).toHaveCount(1)

  await page.goto('/?tv=1')
  await expect(page.getByTestId('web-tv-receiver')).toBeVisible()
})

test('iPhone Safari opens the native AirPlay picker for the current video', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    })
    Object.defineProperty(navigator, 'vendor', {
      configurable: true,
      value: 'Apple Computer, Inc.',
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
      for (const program of channel.programs ?? []) program.playUrl = 'data:video/mp4;base64,AAAA'
    }
    localStorage.setItem(key, JSON.stringify(value))
  })
  await page.reload()
  const airplay = page.getByTestId('cast-button')
  await expect(airplay).toBeVisible()
  // This test stubs the native iOS picker API. Attach a lightweight video
  // element to the actual player shell so the browser's media decoder/network
  // cannot remove the element before the mocked picker is invoked.
  await page.evaluate(() => {
    const player = document.querySelector('[data-testid="crt-player"]')
    if (!player) throw new Error('The TV player shell is not mounted')
    if (!player.querySelector('video')) player.appendChild(document.createElement('video'))
  })
  await expect(page.locator('[data-testid="crt-player"] video')).toBeAttached()
  await expect(airplay).toContainText('AIRPLAY')
  await airplay.click()
  await expect(page.getByRole('status')).toContainText('Select your Apple TV')
  await expect.poll(() => page.evaluate(() => (window as any).__airplayPickerOpened)).toBe(true)
})

test('laptop receiver row expands with the viewport instead of leaving wide empty margins', async ({ page }) => {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport)
    const response = await page.goto('/')
    expect(response?.ok()).toBe(true)
    await expect(page.getByTestId('web-tv-receiver')).toBeVisible()

    const layout = await page.evaluate(() => {
      const measure = (selector: string) => {
        const element = document.querySelector(selector)
        if (!element) throw new Error('Missing layout element: ' + selector)
        const rect = element.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom }
      }
      return {
        viewport: window.innerWidth,
        console: measure('.bb-tv-console'),
        grid: measure('.bb-tv-main-grid'),
        broadcast: measure('.bb-tv-broadcast'),
        player: measure('.bb-tv-screen-bezel'),
        remote: measure('[data-testid="cable-remote"]'),
        guide: measure('.bb-tv-guide-section'),
        columns: getComputedStyle(document.querySelector('.bb-tv-main-grid')!).gridTemplateColumns,
        documentWidth: document.documentElement.scrollWidth,
      }
    })

    console.log('LAPTOP RECEIVER LAYOUT:', JSON.stringify(layout))
    expect(layout.grid.width).toBeGreaterThan(layout.viewport * 0.78)
    expect(layout.grid.x).toBeLessThan(layout.viewport * 0.12)
    expect(layout.grid.right).toBeGreaterThan(layout.viewport * 0.88)
    expect(layout.player.width).toBeGreaterThan(layout.viewport * 0.48)
    expect(layout.remote.width).toBeGreaterThanOrEqual(255)
    expect(Math.abs(layout.remote.bottom - layout.broadcast.bottom)).toBeLessThan(8)
    expect(layout.guide.y).toBe(layout.remote.bottom)
    expect(layout.remote.x).toBeGreaterThan(layout.player.x)
    expect(layout.remote.x - (layout.player.x + layout.player.width)).toBe(0)
    expect(layout.console.x).toBe(0)
    expect(layout.console.width).toBe(layout.viewport)
    expect(layout.guide.x).toBe(0)
    expect(layout.guide.width).toBe(layout.viewport)
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport)
  }
})

test('mobile website keeps the Prevue channel and time-slot matrix', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByTestId('prevue-grid')).toBeVisible()
  await expect(page.getByTestId('guide-viewport')).toBeVisible()
  await expect(page.getByTestId('guide-mobile-list')).toHaveCount(0)
  const timetable = page.getByTestId('guide-surface')
  await expect(timetable).toHaveClass(/overflow-hidden/)
  await expect.poll(() => timetable.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
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
  await expect(viewport).toHaveAttribute('style', /overflow:\s*hidden/)

  // Dispatch cancelable wheel events at the guide viewport. The ancestor
  // guide-surface listener must prevent both horizontal and vertical gestures.
  const wheelProbe = await viewport.evaluate((node) => {
    const dispatchWheel = (deltaX: number, deltaY: number) => {
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaX,
        deltaY,
      })
      node.dispatchEvent(event)
      return event.defaultPrevented
    }
    return {
      horizontalPrevented: dispatchWheel(900, 0),
      verticalPrevented: dispatchWheel(0, 900),
    }
  })
  expect(wheelProbe.horizontalPrevented).toBe(true)
  expect(wheelProbe.verticalPrevented).toBe(true)

  // Manual touch movement on either axis is canceled; the broadcast crawl owns movement.
  const touchProbe = await viewport.evaluate((node) => {
    const dispatchTouch = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: y }] })
      node.dispatchEvent(event)
      return event
    }
    dispatchTouch('touchstart', 100, 100)
    const vertical = dispatchTouch('touchmove', 100, 180)
    dispatchTouch('touchend', 100, 180)
    dispatchTouch('touchstart', 100, 100)
    const horizontal = dispatchTouch('touchmove', 180, 100)
    dispatchTouch('touchend', 180, 100)
    return { verticalPrevented: vertical.defaultPrevented, horizontalPrevented: horizontal.defaultPrevented }
  })
  expect(touchProbe.verticalPrevented).toBe(true)
  expect(touchProbe.horizontalPrevented).toBe(true)

  // Manual input must not stop the automatic Prevue crawl.
  const afterInput = await viewport.evaluate((node) => node.scrollTop)
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop), { timeout: 2000 }).toBeGreaterThan(afterInput)

  const firstProgram = viewport.locator('[data-testid="guide-tune"]').first()
  await firstProgram.focus()
  const beforeKey = await viewport.evaluate((node) => node.scrollTop)
  await page.keyboard.press('ArrowDown')
  // D-pad focus may change, but it must not call scrollIntoView on the guide.
  await expect.poll(async () => Math.abs((await viewport.evaluate((node) => node.scrollTop)) - beforeKey)).toBeLessThan(10)
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


test('web Prevue guide crawls with a short channel lineup', async ({ page }) => {
  await page.goto('/')
  const viewport = page.getByTestId('guide-viewport')
  await expect(viewport).toBeVisible()
  await expect(page.locator('[data-testid="guide-row"]')).toHaveCount(2)
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop), { timeout: 2500 }).toBeGreaterThan(0)
  await expect.poll(() => page.locator('[data-testid="guide-auto-scroll"] > div').count()).toBeGreaterThan(2)
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
  await expect.poll(() => page.locator('[data-testid="guide-auto-scroll"] > div').count()).toBeGreaterThanOrEqual(2)
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


test('desktop website keeps the player and remote compact together and makes the guide immediately prominent', async ({ page }) => {
  mkdirSync('artifacts', { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const player = page.locator('.bb-tv-screen-bezel')
  const remote = page.getByTestId('cable-remote')
  const guide = page.getByTestId('prevue-grid')
  await expect(player).toBeVisible()
  await expect(remote).toBeVisible()
  await expect(guide).toBeVisible()

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) throw new Error('Missing layout element: ' + selector)
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom }
    }
    const programTitle = document.querySelector('.bb-tv-guide-section .bb-guide-program-cell p:first-child')
    const programTime = document.querySelector('.bb-tv-guide-section .bb-guide-program-cell p:last-child')
    return {
      player: rect('.bb-tv-screen-bezel'),
      remote: rect('[data-testid="cable-remote"]'),
      guide: rect('.bb-tv-guide-section'),
      console: rect('.bb-tv-console'),
      grid: rect('.bb-tv-main-grid'),
      guideTitleSize: programTitle ? getComputedStyle(programTitle).fontSize : null,
      guideTimeSize: programTime ? getComputedStyle(programTime).fontSize : null,
      viewportWidth: window.innerWidth,
      consoleGap: getComputedStyle(document.querySelector('.bb-tv-console')!).rowGap,
      guideMarginTop: getComputedStyle(document.querySelector('.bb-tv-guide-section')!).marginTop,
      remoteAlignSelf: getComputedStyle(document.querySelector('[data-testid="cable-remote"]')!).alignSelf,
      remoteAlignContent: getComputedStyle(document.querySelector('[data-testid="cable-remote"]')!).alignContent,
      channelLabelGap: rect('.bb-channel-rockers').y - rect('.bb-cable-receiver > .bb-remote-section-label:nth-child(4)').bottom,
      keypadLabelGap: rect('.bb-number-pad').y - rect('.bb-cable-receiver > .bb-remote-section-label:nth-child(6)').bottom,
      advancedBottomGap: rect('[data-testid="cable-remote"]').bottom - rect('[data-testid="cable-remote"] .bb-remote-advanced').bottom,
    }
  })

  console.log('PUBLIC WEBSITE DESKTOP LAYOUT:', JSON.stringify(layout))
  writeFileSync('artifacts/website-layout-desktop.png', await page.screenshot({ fullPage: true }))

  expect(Math.abs(layout.player.y - layout.remote.y)).toBeLessThan(8)
  expect(layout.remote.x).toBeGreaterThan(layout.player.x)
  expect(layout.remote.x - layout.player.right).toBe(0)
  expect(Math.abs((layout.grid.x + layout.grid.width / 2) - layout.viewportWidth / 2)).toBeLessThan(3)
  expect(layout.console.x).toBe(0)
  expect(layout.console.width).toBe(layout.viewportWidth)
  expect(layout.guide.x).toBe(0)
  expect(layout.guide.width).toBe(layout.viewportWidth)
  expect(layout.guide.y).toBeGreaterThanOrEqual(Math.max(layout.player.bottom, layout.remote.bottom) - 1)
  expect(layout.guide.y - Math.max(layout.player.bottom, layout.remote.bottom)).toBeLessThanOrEqual(1)
  expect(layout.guideTitleSize).toBe('14px')
  expect(layout.guideTimeSize).toBe('11px')
  expect(layout.remoteAlignContent).toBe('stretch')
  expect(layout.channelLabelGap).toBeGreaterThanOrEqual(0)
  expect(layout.channelLabelGap).toBeLessThanOrEqual(10)
  expect(layout.keypadLabelGap).toBeGreaterThanOrEqual(0)
  expect(layout.keypadLabelGap).toBeLessThanOrEqual(10)
  expect(layout.advancedBottomGap).toBeGreaterThanOrEqual(0)
  expect(layout.advancedBottomGap).toBeLessThanOrEqual(25)

  await page.setViewportSize({ width: 390, height: 844 })
  writeFileSync('artifacts/website-layout-mobile.png', await page.screenshot({ fullPage: true }))
  const mobileLayout = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) throw new Error('Missing mobile layout element: ' + selector)
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom }
    }
    const grid = document.querySelector('.bb-tv-main-grid')!
    const channelColumn = document.querySelector('.bb-tv-guide-section .bb-guide-row')!
    return {
      player: box('.bb-tv-screen-bezel'),
      remote: box('[data-testid="cable-remote"]'),
      guide: box('.bb-tv-guide-section'),
      header: box('.bb-tv-header'),
      headerColumns: getComputedStyle(document.querySelector('.bb-tv-header')!).gridTemplateColumns,
      nav: box('.bb-tv-header nav'),
      columns: getComputedStyle(grid).gridTemplateColumns,
      guideColumns: getComputedStyle(channelColumn).gridTemplateColumns,
    }
  })
  const mobileType = await page.locator('.bb-tv-guide-section .bb-guide-program-cell p:first-child').first().evaluate(
    (element) => getComputedStyle(element).fontSize,
  )
  console.log('PUBLIC WEBSITE MOBILE LAYOUT:', JSON.stringify(mobileLayout))
  expect(mobileLayout.headerColumns.trim().split(/\s+/)).toHaveLength(1)
  expect(mobileLayout.nav.y).toBeGreaterThan(mobileLayout.header.y)
  expect(mobileLayout.columns.trim().split(/\s+/)).toHaveLength(1)
  expect(mobileLayout.player.width).toBeGreaterThan(320)
  expect(mobileLayout.remote.width).toBeGreaterThan(320)
  expect(mobileLayout.remote.y).toBeGreaterThan(mobileLayout.player.bottom - 8)
  expect(mobileLayout.guide.width).toBeGreaterThan(350)
  expect(mobileLayout.guideColumns.startsWith('112px')).toBe(true)
  expect(mobileType).toBe(layout.guideTitleSize)
  await expect(guide).toBeVisible()
  await expect(remote).toBeVisible()
})
