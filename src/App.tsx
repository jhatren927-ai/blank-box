import { useCallback, useEffect, useRef, useState } from 'react'
import type { Channel, Program } from './types.ts'
import { useStore } from './state.tsx'
import { clock, padChannel } from './lib/format.ts'
import { liveSlot, nextSlot } from './lib/schedule.ts'
import { networkName } from './lib/names.ts'
import { getAccountNetwork, loadCloudNetwork, saveAccountNetwork } from './lib/cloudSave.ts'
import { CableBox, nextRate, useShakeTune } from './components/CableBox.tsx'
import { Builder } from './components/Builder.tsx'
import { Guide, Ticker } from './components/Guide.tsx'
import { LockScreen } from './components/LockScreen.tsx'
import { OnDemand } from './components/OnDemand.tsx'
import { Player, requestFullscreen } from './components/Player.tsx'
import { TvExperience } from './components/TvExperience.tsx'
import { Settings } from './components/Settings.tsx'
import { Modal } from './components/ui/dialog.tsx'

type View = 'tv' | 'build' | 'demand' | 'settings'

function AppContent() {
  const store = useStore()
  const { network, prefs } = store
  const [view, setView] = useState<View>('tv')
  // The approved TV receiver is now the normal website experience. Add ?classic=1 only to open the retired browser layout.
  const [tvMode, setTvMode] = useState(() => new URLSearchParams(window.location.search).get('classic') !== '1')
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Channel | null>(null)
  const [vod, setVod] = useState<Program | null>(null)
  const [castTarget, setCastTarget] = useState<{ program: Program; offsetSec: number } | null>(null)
  const updateCastTarget = useCallback((target: { program: Program; offsetSec: number } | null) => {
    setCastTarget((current) => current?.program.id === target?.program.id && current?.offsetSec === target?.offsetSec ? current : target)
  }, [])
  const [now, setNow] = useState(() => Date.now())
  const [help, setHelp] = useState(false)
  const [dial, setDial] = useState('')
  // Desktop browsers open directly into the EPG; TV browsers and the explicit ?tv=1 player route start on live picture.
  const [tvGuideOpen, setTvGuideOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const tvBrowser = document.documentElement.dataset.tvApp === 'true'
      || /AFTT|Fire TV|Android TV|GoogleTV|BRAVIA/i.test(navigator.userAgent)
    return params.get('classic') !== '1' && params.get('tv') !== '1' && !tvBrowser
  })
  const [tvMenuOpen, setTvMenuOpen] = useState(false)
  const [guideSelectedId, setGuideSelectedId] = useState<string | null>(null)
  const [guidePage, setGuidePage] = useState(0)
  const screenRef = useRef<HTMLDivElement>(null)
  const dialTimer = useRef<number | null>(null)
  const cloudRestoreStarted = useRef(false)
  const [accountSyncReady, setAccountSyncReady] = useState(false)
  const ordered = network.channels.slice().sort((a, b) => a.number - b.number)
  const current = ordered.find((channel) => channel.id === currentId) ?? null
  const currentLive = current ? liveSlot(current, now) : null
  const currentNext = current ? nextSlot(current, now) : null

  useEffect(() => {
    const token = localStorage.getItem('blankbox-license-session')
    if (!token) return
    void (async () => {
      try {
        const cloudNetwork = await getAccountNetwork(token)
        if (cloudNetwork) {
          store.replaceNetwork(cloudNetwork)
        } else {
          // First sign-in on this account: preserve the channels already on this device.
          await saveAccountNetwork(token, network)
        }
        setAccountSyncReady(true)
      } catch (error) {
        console.error('Blank Box account restore failed:', error)
      }
    })()
  }, [])

  useEffect(() => {
    if (!accountSyncReady) return
    const token = localStorage.getItem('blankbox-license-session')
    if (!token) return
    const timer = window.setTimeout(() => {
      void saveAccountNetwork(token, network).catch((error: unknown) => {
        console.error('Blank Box automatic save failed:', error)
      })
    }, 900)
    return () => window.clearTimeout(timer)
  }, [accountSyncReady, network])

  useEffect(() => {
    // A five-second clock tick keeps the EPG current without forcing a full app
    // render every second on constrained Android TV WebViews.
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!tvMode || !tvMenuOpen) return
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>('[data-testid="tv-menu-return"]')?.focus({ preventScroll: true })
    }, 100)
    return () => window.clearTimeout(timer)
  }, [tvMode, tvMenuOpen])

  useEffect(() => {
    if (cloudRestoreStarted.current) return
    const key = new URLSearchParams(window.location.search).get('load')
    if (!key) return
    cloudRestoreStarted.current = true
    void loadCloudNetwork(key).then((next) => {
      store.replaceNetwork(next)
      const url = new URL(window.location.href)
      url.searchParams.delete('load')
      window.history.replaceState({}, '', url.toString())
    }).catch((error: unknown) => {
      window.alert(error instanceof Error ? error.message : 'Could not load that saved lineup.')
    })
  }, [store])

  useEffect(() => {
    const enabled = new URLSearchParams(window.location.search).get('classic') !== '1'
    setTvMode(enabled)
    document.documentElement.classList.toggle('tv-mode', enabled)
    return () => document.documentElement.classList.remove('tv-mode')
  }, [])

  useEffect(() => {
    if (!currentId && ordered[0]) setCurrentId(ordered[0].id)
    if (currentId && !ordered.some((channel) => channel.id === currentId)) {
      setCurrentId(ordered[0]?.id ?? null)
    }
  }, [currentId, ordered])

  function tune(id: string) {
    setCurrentId(id)
    setVod(null)
    setView('tv')
    setTvGuideOpen(false)
    setTvMenuOpen(false)
    setGuideSelectedId(id)
    store.remember(id)
  }

  function step(dir: 1 | -1) {
    if (ordered.length === 0) return
    const index = ordered.findIndex((channel) => channel.id === current?.id)
    const next = ordered[(index + dir + ordered.length) % ordered.length]
    tune(next.id)
  }

  useShakeTune(prefs.shake && view === 'tv', () => {
    if (ordered.length === 0) return
    const pick = ordered[Math.floor(Math.random() * ordered.length)]
    tune(pick.id)
  })

  function enterDigit(digit: string) {
    const next = (dial + digit).slice(-3)
    setDial(next)
    if (dialTimer.current) window.clearTimeout(dialTimer.current)
    dialTimer.current = window.setTimeout(() => {
      const number = Number(next)
      const match = ordered.find((channel) => channel.number === number)
      if (match) tune(match.id)
      setDial('')
    }, 900)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isBack = event.key === 'Escape' || event.key === 'Backspace' || event.key === 'BrowserBack'
      const isAccept = event.key === 'Enter' || event.key === ' ' || event.key === 'Select' || event.key === 'DPAD_CENTER'

      if (isBack && view !== 'tv') {
        event.preventDefault()
        setView('tv')
        setTvGuideOpen(false)
        setTvMenuOpen(false)
        return
      }
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

      if (tvMode && view === 'tv') {
        if (isBack) {
          event.preventDefault()
          if (tvGuideOpen) setTvGuideOpen(false)
          else if (tvMenuOpen) setTvMenuOpen(false)
          else setTvMenuOpen(true)
          return
        }

        if (tvGuideOpen) {
          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            event.preventDefault()
            const rows = Array.from(document.querySelectorAll<HTMLElement>('.bb-tv-guide-row'))
            const active = document.activeElement as HTMLElement | null
            const activeRow = active?.closest<HTMLElement>('.bb-tv-guide-row') ?? rows.find((row) => row.dataset.channelId === (guideSelectedId ?? currentId))
            if (!activeRow || rows.length === 0) return
            const rowButtons = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>(
              '[data-testid="tv-guide-channel"], [data-testid="tv-guide-program"]',
            ))
            const buttons = rowButtons(activeRow)
            const activeIndex = Math.max(0, buttons.indexOf(active as HTMLElement))
            let destination: HTMLElement | undefined
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              const nextIndex = activeIndex + (event.key === 'ArrowLeft' ? -1 : 1)
              destination = buttons[nextIndex]
              // At the edge of the six-slot grid, page the guide by three hours.
              if (!destination && buttons.length > 0) {
                setGuidePage((page) => page + (event.key === 'ArrowLeft' ? -1 : 1))
                window.setTimeout(() => {
                  document.querySelector<HTMLElement>(
                    '[data-channel-id="' + activeRow.dataset.channelId + '"] [data-testid="tv-guide-channel"]',
                  )?.focus({ preventScroll: true })
                }, 0)
                return
              }
            } else {
              const rowIndex = rows.indexOf(activeRow)
              const nextRow = rows[rowIndex + (event.key === 'ArrowUp' ? -1 : 1)]
              if (nextRow) {
                const candidates = rowButtons(nextRow)
                const activeRect = active?.getBoundingClientRect()
                const centerX = activeRect ? activeRect.left + activeRect.width / 2 : 0
                destination = candidates.sort((a, b) => {
                  const aRect = a.getBoundingClientRect()
                  const bRect = b.getBoundingClientRect()
                  return Math.abs(aRect.left + aRect.width / 2 - centerX) - Math.abs(bRect.left + bRect.width / 2 - centerX)
                })[0]
              } else {
                const currentIndex = ordered.findIndex((item) => item.id === activeRow.dataset.channelId)
                const nextIndex = (currentIndex + (event.key === 'ArrowUp' ? -1 : 1) + ordered.length) % ordered.length
                if (ordered[nextIndex]) {
                  setGuideSelectedId(ordered[nextIndex].id)
                  window.setTimeout(() => {
                    document.querySelector<HTMLElement>('[data-channel-id="' + ordered[nextIndex].id + '"] [data-testid="tv-guide-channel"]')?.focus({ preventScroll: true })
                  }, 0)
                }
              }
            }
            if (destination) {
              const destinationRow = destination.closest<HTMLElement>('.bb-tv-guide-row')
              if (destinationRow?.dataset.channelId) setGuideSelectedId(destinationRow.dataset.channelId)
              destination.focus({ preventScroll: true })
              destination.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            }
            return
          }
          if (isAccept) {
            event.preventDefault()
            const selected = guideSelectedId ?? currentId
            if (selected) tune(selected)
            else setTvGuideOpen(false)
            return
          }
          if (event.key === 'Guide' || event.key === 'g' || event.key === 'G') {
            event.preventDefault()
            setTvGuideOpen(false)
            return
          }
          if (/^\d$/.test(event.key)) {
            enterDigit(event.key)
            return
          }
          if (event.key === 'm' || event.key === 'M') {
            store.patchPrefs({ muted: !prefs.muted })
            return
          }
          return
        }

        if (!tvMenuOpen) {
          if (isAccept || event.key === 'Guide' || event.key === 'g' || event.key === 'G') {
            event.preventDefault()
            setGuideSelectedId(currentId)
            setGuidePage(0)
            setTvGuideOpen(true)
            return
          }
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            step(event.key === 'ArrowUp' ? 1 : -1)
            return
          }
          if (/^\d$/.test(event.key)) {
            enterDigit(event.key)
            return
          }
          if (event.key === 'm' || event.key === 'M') {
            store.patchPrefs({ muted: !prefs.muted })
            return
          }
          if (event.key === 'f' || event.key === 'F') {
            void requestFullscreen(screenRef.current)
            return
          }
          if (event.key === 'AudioVolumeUp' || event.key === 'VolumeUp') {
            store.patchPrefs({ volume: Math.min(1, prefs.volume + 0.1), muted: false })
            return
          }
          if (event.key === 'AudioVolumeDown' || event.key === 'VolumeDown') {
            store.patchPrefs({ volume: Math.max(0, prefs.volume - 0.1), muted: false })
            return
          }
          if (event.key === '?') {
            setHelp(true)
            return
          }
          return
        }
      }

      // The TV remote's D-pad must scroll the guide when focus is anywhere
      // inside it; otherwise the global focus navigation consumes Up/Down.
      const guideScroller = target?.closest<HTMLElement>(
        '[data-testid="guide-viewport"], [data-testid="guide-mobile-list"]',
      )
      if (guideScroller && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const amount = Math.max(120, Math.round(guideScroller.clientHeight * 0.8))
        if (event.key === 'Home') guideScroller.scrollTo({ top: 0, behavior: 'auto' })
        else if (event.key === 'End') guideScroller.scrollTo({ top: guideScroller.scrollHeight, behavior: 'auto' })
        else guideScroller.scrollBy({
          top: event.key === 'ArrowUp' || event.key === 'PageUp' ? -amount : amount,
          behavior: 'auto',
        })
        return
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const activeDialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
          .filter((element) => element.getClientRects().length > 0)
          .at(-1)
        const focusScope: ParentNode = activeDialog ?? document
        const controls = Array.from(focusScope.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.getClientRects().length > 0)
        const active = document.activeElement as HTMLElement | null
        if (active && controls.includes(active)) {
          const origin = active.getBoundingClientRect()
          const ox = origin.left + origin.width / 2
          const oy = origin.top + origin.height / 2
          const candidates = controls
            .filter((element) => element !== active)
            .map((element) => {
              const rect = element.getBoundingClientRect()
              const dx = rect.left + rect.width / 2 - ox
              const dy = rect.top + rect.height / 2 - oy
              const primary = event.key === 'ArrowLeft' ? -dx
                : event.key === 'ArrowRight' ? dx
                  : event.key === 'ArrowUp' ? -dy : dy
              const cross = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? Math.abs(dy) : Math.abs(dx)
              const aligned = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
                ? rect.top < origin.bottom && rect.bottom > origin.top
                : rect.left < origin.right && rect.right > origin.left
              return { element, primary, score: primary + cross * 2 + (aligned ? 0 : 120) }
            })
            .filter((candidate) => candidate.primary > 4)
            .sort((a, b) => a.score - b.score)
          let next: HTMLElement | undefined = candidates.length ? candidates[0].element : undefined
          if (!next && activeDialog && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            const vertical = controls
              .filter((element) => element !== active)
              .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
            next = event.key === 'ArrowDown' ? vertical[0] : vertical.at(-1)
          }
          if (next) {
            event.preventDefault()
            next.focus({ preventScroll: true })
            next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }
          return
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          step(event.key === 'ArrowUp' ? 1 : -1)
        }
        return
      }

      if (event.key === 'm' || event.key === 'M') {
        store.patchPrefs({ muted: !prefs.muted })
      } else if (event.key === 'f' || event.key === 'F') {
        void requestFullscreen(screenRef.current)
      } else if (event.key === '?') {
        setHelp(true)
      } else if (/^\d$/.test(event.key)) {
        enterDigit(event.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (network.pin && !store.unlocked) {
    return (
      <LockScreen
        network={network}
        onUnlock={store.unlock}
        onClear={() => {
          void store.setPin(null)
          store.unlock()
        }}
      />
    )
  }

  return (
    <div className={tvMode ? "min-h-screen bg-chassis text-slate-100" : "bb-web-shell min-h-screen text-slate-100"}>
      {!tvMode && <header className="bb-web-header sticky top-0 z-40 backdrop-blur">
        <div className="bb-web-header-inner mx-auto flex max-w-6xl items-end gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="bb-web-kicker font-heading text-[10px] font-black tracking-[0.28em]">{tvMode ? 'LOCAL CABLE TELEVISION  /  EST. 1995' : 'BLANK BOX'}</p>
            <input
              data-testid="network-name"
              aria-label="Network name"
              value={network.name}
              maxLength={40}
              onChange={(event) => store.setName(event.target.value)}
              onBlur={() => {
                if (!network.name.trim()) store.setName(networkName(String(Date.now())))
              }}
              className="bb-web-network-name w-full bg-transparent font-heading text-2xl font-black uppercase tracking-tight outline-none sm:text-3xl"
            />
          </div>
          <p className="bb-web-clock pb-1 font-mono text-sm tabular-nums">{clock(now)}</p>
        </div>
        <nav className="bb-web-nav mx-auto flex max-w-6xl gap-2 overflow-x-auto px-3 pb-3">
          <NavButton testId="nav-tv" active={view === 'tv'} onClick={() => setView('tv')}>
            {tvMode ? 'LIVE TV' : 'TV'}
          </NavButton>
          <NavButton
            testId="nav-guide"
            active={false}
            onClick={() => {
              setView('tv')
              window.setTimeout(() => {
                document.getElementById('guide')?.scrollIntoView({ behavior: 'smooth' })
              }, 50)
            }}
          >
            Guide
          </NavButton>
          <NavButton testId="nav-demand" active={view === 'demand'} onClick={() => setView('demand')}>
            On Demand
          </NavButton>
          <NavButton testId="nav-settings" active={view === 'settings'} onClick={() => setView('settings')}>
            {tvMode ? 'SETUP' : 'Settings'}
          </NavButton>
        </nav>
      </header>}
      {tvMode && view !== 'tv' && (
        <button type="button" data-testid="tv-return-button" className="bb-tv-return-button" onClick={() => setView('tv')}>← BACK TO TELEVISION</button>
      )}

      {view === 'tv' && (
        <>
          {tvMode ? (
            <TvExperience
              channels={ordered}
              channel={current}
              currentId={current?.id ?? null}
              now={now}
              vod={vod}
              prefs={prefs}
              screenRef={screenRef}
              guideOpen={tvGuideOpen}
              selectedGuideId={guideSelectedId}
              guidePage={guidePage}
              menuOpen={tvMenuOpen}
              onSelectGuideChannel={setGuideSelectedId}
              onCloseMenu={() => setTvMenuOpen(false)}
              onExitVod={() => setVod(null)}
              onUnmute={() => store.patchPrefs({ muted: false, volume: Math.max(prefs.volume, 0.4) })}
              onToggleMute={() => store.patchPrefs({ muted: !prefs.muted })}
              onVolumeChange={(volume) => store.patchPrefs({ volume, muted: false })}
              onProgramDuration={(programId, seconds) => {
                if (!current) return
                const program = current.programs.find((item) => item.id === programId)
                if (!program || Math.abs(program.durationSec - seconds) <= 2) return
                store.saveChannel({
                  ...current,
                  programs: current.programs.map((item) => item.id === programId
                    ? { ...item, durationSec: seconds, durationGuess: false }
                    : item),
                })
              }}
              onTune={tune}
              onNew={() => {
                setTvGuideOpen(false)
                setTvMenuOpen(false)
                setEditing(null)
                setView('build')
              }}
              onDemand={() => {
                setTvGuideOpen(false)
                setTvMenuOpen(false)
                setView('demand')
              }}
              onSettings={() => {
                setTvGuideOpen(false)
                setTvMenuOpen(false)
                setView('settings')
              }}
              onLast={() => {
                const last = prefs.recent.find((id) => id !== current?.id)
                if (last) tune(last)
              }}
              onSurprise={() => {
                if (ordered.length === 0) return
                tune(ordered[Math.floor(Math.random() * ordered.length)].id)
              }}
              onHelp={() => {
                setTvMenuOpen(false)
                setHelp(true)
              }}
            />
          ) : (
            <>
          <div className="bb-web-broadcast-shell">
            <Ticker channels={ordered} now={now} />
            <section className="bb-web-nowbar" aria-label="Current broadcast" data-testid="web-nowbar">
              <div className="bb-web-nowbar-label"><span className="bb-web-onair-dot" /> ON AIR</div>
              <div className="bb-web-nowbar-channel">
                <strong>{current ? padChannel(current.number) : '---'}</strong>
                <span>{current?.callsign ?? 'NO SIGNAL'}</span>
              </div>
              <div className="bb-web-nowbar-program">
                <span className="bb-web-micro-label">NOW PLAYING</span>
                <strong>{currentLive?.program.title ?? (current ? 'OFF THE AIR' : 'BUILD YOUR CHANNEL LINEUP')}</strong>
              </div>
              <div className="bb-web-nowbar-next">
                <span className="bb-web-micro-label">COMING UP</span>
                <strong>{currentNext?.program.title ?? 'STAY TUNED'}</strong>
              </div>
              <div className="bb-web-nowbar-time">{clock(now)}</div>
            </section>
          </div>
          {dial && (
            <div data-testid="dial-osd" className="pointer-events-none fixed left-1/2 top-24 z-40 -translate-x-1/2 bg-black/80 px-6 py-3 font-mono text-5xl font-bold text-green-400">
              {dial}
            </div>
          )}
          <main className="bb-web-main mx-auto grid w-full max-w-none grid-cols-1 items-start gap-4 px-3 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,0.85fr)] lg:gap-5">
            <section className="bb-web-screen-column" aria-label="Television broadcast">
              <div className="bb-web-screen-heading">
                <div>
                  <span className="bb-web-micro-label">NOW TUNED · LIVE CHANNEL</span>
                  <h1>{current?.name ?? 'Your television starts here'}</h1>
                  <p>{currentLive?.program.title ?? (current ? 'No program scheduled right now' : 'Add a channel to begin broadcasting')}</p>
                </div>
                <div className="bb-web-channel-bug"><span>CH</span><strong>{current ? padChannel(current.number) : '---'}</strong></div>
              </div>
              <Player
              screenRef={screenRef}
              channel={current}
              now={now}
              vod={vod}
              onExitVod={() => setVod(null)}
              muted={prefs.muted}
              volume={prefs.volume}
              rate={prefs.rate}
              crt={prefs.crt}
              aspect={prefs.aspect}
              showLogo={prefs.logo}
              onUnmute={() => store.patchPrefs({ muted: false, volume: Math.max(prefs.volume, 0.4) })}
              onCastTargetChange={updateCastTarget}
              onProgramDuration={(programId, seconds) => {
                if (!current) return
                const program = current.programs.find((item) => item.id === programId)
                if (!program || Math.abs(program.durationSec - seconds) <= 2) return
                store.saveChannel({
                  ...current,
                  programs: current.programs.map((item) => item.id === programId
                    ? { ...item, durationSec: seconds, durationGuess: false }
                    : item),
                })
              }}
              />
              <div className="bb-web-screen-caption">
                <span><i className="bb-web-onair-dot" /> LIVE BROADCAST</span>
                <span>{current ? current.callsign + ' · ' + current.name : 'BLANK BOX COMMUNITY TELEVISION'}</span>
                <span>{prefs.muted ? 'SOUND MUTED' : 'STEREO SOUND'}</span>
              </div>
            </section>
            <aside className="bb-web-console-column" aria-label="Cable box controls">
              <div className="bb-web-console-heading">
                <span className="bb-web-micro-label">YOUR RECEIVER</span>
                <h2>CHANNEL SELECTOR</h2>
                <p>Pick a station, adjust the picture, or tune directly.</p>
              </div>
            <CableBox
              channels={ordered}
              currentId={current?.id ?? null}
              prefs={prefs}
              castTarget={castTarget}
              onTune={tune}
              onStep={step}
              onNew={() => {
                setEditing(null)
                setView('build')
              }}
              onEdit={(id) => {
                setEditing(ordered.find((channel) => channel.id === id) ?? null)
                setView('build')
              }}
              onMute={() => store.patchPrefs({ muted: !prefs.muted })}
              onVolume={(volume) => store.patchPrefs({ volume, muted: false })}
              onFullscreen={() => void requestFullscreen(screenRef.current)}
              onCrt={() => store.patchPrefs({ crt: !prefs.crt })}
              onAspect={() => store.patchPrefs({ aspect: prefs.aspect === '16:9' ? '4:3' : '16:9' })}
              onRate={() => store.patchPrefs({ rate: nextRate(prefs.rate) })}
              onLogo={() => store.patchPrefs({ logo: !prefs.logo })}
              onLast={() => {
                const last = prefs.recent.find((id) => id !== current?.id)
                if (last) tune(last)
              }}
              onFav={store.toggleFav}
              onSurprise={() => {
                if (ordered.length === 0) return
                tune(ordered[Math.floor(Math.random() * ordered.length)].id)
              }}
              onHelp={() => setHelp(true)}
              onShake={() => {
                const next = !prefs.shake
                store.patchPrefs({ shake: next })
                const motion = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }
                if (next && motion.requestPermission) void motion.requestPermission().catch(() => undefined)
              }}
              onClearRecent={() => store.patchPrefs({ recent: [] })}
            />
            </aside>
          </main>
          <div className="bb-web-guide-wrap mx-auto w-full max-w-none px-3 pb-10">
            <div className="bb-web-guide-intro">
              <div><span className="bb-web-micro-label">WHAT'S ON TELEVISION</span><h2>THE PROGRAM GUIDE</h2></div>
              <p>Browse the schedule. Select any channel to tune in.</p>
            </div>
            <Guide
              channels={ordered}
              currentId={current?.id ?? null}
              now={now}
              title={network.name || 'Your'}
              favs={prefs.favs}
              onTune={tune}
            />
            <footer className="bb-web-footer">
              <span>BLANK BOX TELEVISION</span><span>YOUR NETWORK · YOUR LINEUP · YOUR AIRWAVES</span><span>EST. 1995</span>
            </footer>
          </div>

            </>
          )}        </>
      )}

      {view === 'build' && (
        <Builder
          channels={ordered}
          initial={editing}
          onClose={() => setView('tv')}
          onDelete={(id) => {
            store.deleteChannel(id)
            setEditing(null)
            setView('tv')
          }}
          onSave={(channel) => {
            store.saveChannel(channel)
            tune(channel.id)
          }}
        />
      )}
      {view === 'demand' && (
        <OnDemand
          channels={ordered}
          onPlay={(channelId, program) => {
            setCurrentId(channelId)
            setVod(program)
            store.remember(channelId)
            setView('tv')
          }}
        />
      )}
      {view === 'settings' && (
        <Settings
          network={network}
          onPin={store.setPin}
          onImport={(next) => {
            store.replaceNetwork(next)
            setCurrentId(next.channels[0]?.id ?? null)
            setView('tv')
          }}
          onReset={() => {
            store.reset()
            setCurrentId(null)
            setVod(null)
            setView('tv')
          }}
        />
      )}

      <Modal open={help} onOpenChange={setHelp} title="How the remote works">
        <ul className="space-y-2 font-mono text-sm text-slate-200">
          <li>Up and down flip channels while the picture stays on.</li>
          <li>Press OK for the program guide. Up and down select a station; left and right page through the schedule; OK tunes in.</li>
          <li>Type a channel number to jump directly. M toggles sound; F toggles fullscreen.</li>
          <li>Back opens the TV menu, where you can edit channels, browse On Demand, or change settings.</li>
        </ul>
      </Modal>
    </div>
  )
}

function NavButton({
  children,
  active,
  onClick,
  testId,
}: {
  children: string
  active: boolean
  onClick: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={`h-11 shrink-0 rounded-sm px-4 font-mono text-sm font-bold ${active ? 'bg-yellow-400 text-black' : 'bg-[#1b2333] text-slate-100'}`}
    >
      {children}
    </button>
  )
}


import { LicenseGate } from './components/LicenseGate.tsx'

export default function App() {
  return <LicenseGate><AppContent /></LicenseGate>
}
