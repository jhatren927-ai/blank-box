import { useEffect, useState, type RefObject } from 'react'
import type { Channel, Prefs, Program } from '../types.ts'
import { clock, padChannel } from '../lib/format.ts'
import { guideWindow, liveSlot, nextSlot, slotsCovering } from '../lib/schedule.ts'
import { Player } from './Player.tsx'

interface TvExperienceProps {
  channels: Channel[]
  channel: Channel | null
  currentId: string | null
  now: number
  vod: Program | null
  prefs: Prefs
  screenRef: RefObject<HTMLDivElement | null>
  guideOpen: boolean
  selectedGuideId: string | null
  guidePage: number
  menuOpen: boolean
  onSelectGuideChannel: (id: string) => void
  onUnmute: () => void
  onCloseMenu: () => void
  onExitVod: () => void
  onProgramDuration: (programId: string, seconds: number) => void
  onTune: (id: string) => void
  onNew: () => void
  onDemand: () => void
  onSettings: () => void
  onLast: () => void
  onSurprise: () => void
  onHelp: () => void
}

const GUIDE_ROWS = 7
const GUIDE_COLUMNS = 6
const HALF_HOUR = 30 * 60 * 1000

export function TvExperience({
  channels,
  channel,
  currentId,
  now,
  vod,
  prefs,
  screenRef,
  guideOpen,
  selectedGuideId,
  guidePage,
  menuOpen,
  onSelectGuideChannel,
  onUnmute,
  onCloseMenu,
  onExitVod,
  onProgramDuration,
  onTune,
  onNew,
  onDemand,
  onSettings,
  onLast,
  onSurprise,
  onHelp,
}: TvExperienceProps) {
  const live = channel ? liveSlot(channel, now) : null
  const [showLowerThird, setShowLowerThird] = useState(true)

  useEffect(() => {
    setShowLowerThird(true)
    const timer = window.setTimeout(() => setShowLowerThird(false), 5200)
    return () => window.clearTimeout(timer)
  }, [channel?.id, live?.program.id, vod?.id])
  const next = channel ? nextSlot(channel, now) : null
  const selected = channels.find((item) => item.id === selectedGuideId) ?? channel
  const selectedLive = selected ? liveSlot(selected, now) : null
  const selectedNext = selected ? nextSlot(selected, now) : null
  const secondsLeft = live ? Math.max(0, Math.ceil((live.endMs - now) / 1000)) : 0
  const baseWindow = guideWindow(now)
  const windowSpan = baseWindow.end - baseWindow.start
  const windowStart = baseWindow.start + guidePage * windowSpan
  const windowEnd = windowStart + windowSpan
  const selectedIndex = channels.findIndex((item) => item.id === (selectedGuideId ?? currentId))
  const safeIndex = selectedIndex < 0 ? 0 : selectedIndex
  const firstVisible = Math.max(0, Math.min(Math.max(0, channels.length - GUIDE_ROWS), safeIndex - Math.floor(GUIDE_ROWS / 2)))
  const visibleChannels = channels.slice(firstVisible, firstVisible + GUIDE_ROWS)
  const markerVisible = now >= windowStart && now < windowEnd
  const marker = markerVisible ? ((now - windowStart) / windowSpan) * 100 : -1
  const guideDate = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(windowStart))

  useEffect(() => {
    if (!guideOpen) return
    const timer = window.setTimeout(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>('.bb-tv-guide-row'))
        .find((item) => item.dataset.channelId === (selectedGuideId ?? currentId))
      row?.querySelector<HTMLElement>('[data-testid="tv-guide-channel"]')?.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [guideOpen, selectedGuideId, currentId, firstVisible])

  const currentTitle = vod?.title || live?.program.title || 'NO PROGRAM SCHEDULED'
  const currentChannel = channel ? `CH ${padChannel(channel.number)}  ·  ${channel.callsign}` : 'NO CHANNEL SELECTED'

  return (
    <main
      className={`bb-tv-experience${guideOpen ? ' is-guide-open' : ''}${menuOpen ? ' is-menu-open' : ''}`}
      data-testid="tv-experience"
    >
      <section className="bb-tv-stage" aria-label="Live television picture">
        <Player
          screenRef={screenRef}
          channel={channel}
          now={now}
          vod={vod}
          onExitVod={onExitVod}
          muted={prefs.muted}
          volume={prefs.volume}
          rate={prefs.rate}
          crt={prefs.crt}
          aspect={prefs.aspect}
          showLogo={prefs.logo}
          onUnmute={onUnmute}
          onProgramDuration={onProgramDuration}
        />
        {!guideOpen && (
          <>
            <div className="bb-tv-corner-bug" aria-hidden="true">
              <strong>BLANK BOX <span>TV</span></strong>
              <time>{clock(now)}</time>
            </div>
            <div className="bb-tv-watch-hint" aria-hidden="true">
              ▲ / ▼ CHANNEL <i /> OK GUIDE <i /> 0–9 DIRECT TUNE <i /> M SOUND <i /> BACK MENU
            </div>
            {channel && showLowerThird && (
              <div className="bb-tv-live-lower-third" data-testid="tv-live-lower-third">
                <div className="bb-tv-lower-channel">
                  <strong>{padChannel(channel.number)}</strong>
                  <span>{channel.callsign}</span>
                </div>
                <div className="bb-tv-lower-copy">
                  <span>{channel.name}</span>
                  <strong>{currentTitle}</strong>
                  <small>
                    {vod ? 'ON DEMAND' : live ? `NOW PLAYING · ${Math.floor(secondsLeft / 60)} MIN LEFT` : 'OFF AIR'}
                    {next ? `  ·  NEXT: ${next.program.title}` : ''}
                  </small>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {guideOpen && (
        <section className="bb-tv-guide-overlay" role="dialog" aria-modal="true" aria-label="Television program guide" data-testid="tv-guide-overlay">
          <header className="bb-tv-guide-top">
            <div className="bb-tv-guide-selected">
              <div className="bb-tv-guide-brandline">
                <span className="bb-tv-guide-brand">BLANK BOX <b>TV</b></span>
                <span className="bb-tv-guide-date">{guideDate} · {clock(now)}</span>
              </div>
              {selected ? (
                <>
                  <div className="bb-tv-guide-station">{padChannel(selected.number)} <span>{selected.callsign}</span> <small>{selected.name}</small></div>
                  <h2>{selectedLive?.program.title ?? 'OFF THE AIR'}</h2>
                  <p className="bb-tv-guide-description">
                    {selectedLive
                      ? `ON NOW · ${clock(selectedLive.startMs)} – ${clock(selectedLive.endMs)}`
                      : 'This channel has no scheduled programs yet.'}
                  </p>
                  {selectedLive && (
                    <div className="bb-tv-guide-progress">
                      <span style={{ width: `${Math.min(100, Math.max(0, ((now - selectedLive.startMs) / (selectedLive.endMs - selectedLive.startMs)) * 100))}%` }} />
                    </div>
                  )}
                  <div className="bb-tv-guide-next">
                    <span>UP NEXT</span>
                    <strong>{selectedNext?.program.title ?? '—'}</strong>
                    {selectedNext && <small>{clock(selectedNext.startMs)}</small>}
                  </div>
                </>
              ) : (
                <>
                  <div className="bb-tv-guide-station">NO CHANNELS</div>
                  <h2>Your TV lineup is empty</h2>
                  <p className="bb-tv-guide-description">Open the menu to add your first channel.</p>
                </>
              )}
            </div>
          </header>

          <div className="bb-tv-guide-grid" data-testid="tv-guide-grid">
            <div className="bb-tv-guide-time-row">
              <div className="bb-tv-guide-channel-heading">CHANNEL</div>
              <div className="bb-tv-guide-time-cells">
                {Array.from({ length: GUIDE_COLUMNS }, (_, index) => (
                  <div key={index}>{clock(windowStart + index * HALF_HOUR)}</div>
                ))}
              </div>
            </div>

            <div
              className="bb-tv-guide-rows"
              data-testid="tv-guide-rows"
              style={{ gridTemplateRows: `repeat(${Math.max(1, visibleChannels.length)}, minmax(0, 1fr))` }}
            >
              {visibleChannels.map((item) => {
                const active = item.id === (selectedGuideId ?? currentId)
                const slots = slotsCovering(item, windowStart, windowEnd)
                return (
                  <div className={`bb-tv-guide-row${active ? ' is-selected' : ''}`} key={item.id} data-channel-id={item.id}>
                    <button
                      type="button"
                      className="bb-tv-guide-channel"
                      data-testid="tv-guide-channel"
                      aria-pressed={active}
                      onClick={() => onSelectGuideChannel(item.id)}
                      onDoubleClick={() => onTune(item.id)}
                    >
                      <strong>{padChannel(item.number)}</strong>
                      <span>{item.callsign}</span>
                      <small>{item.name}</small>
                    </button>
                    <div className="bb-tv-guide-track">
                      {slots.map((slot, index) => {
                        const left = Math.max(slot.startMs, windowStart)
                        const right = Math.min(slot.endMs, windowEnd)
                        const isNow = slot.startMs <= now && now < slot.endMs
                        return (
                          <button
                            key={`${slot.program.id}-${slot.startMs}-${index}`}
                            type="button"
                            className={`bb-tv-guide-program${isNow ? ' is-now' : ''}`}
                            style={{
                              left: `${((left - windowStart) / windowSpan) * 100}%`,
                              width: `${((right - left) / windowSpan) * 100}%`,
                            }}
                            title={slot.program.title}
                            onClick={() => onTune(item.id)}
                          >
                            <strong>{slot.program.title}</strong>
                            <small>{clock(slot.startMs)}</small>
                          </button>
                        )
                      })}
                      {markerVisible && <span className="bb-tv-guide-now-marker" style={{ left: `${marker}%` }} />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <footer className="bb-tv-guide-footer">
            <span>▲ ▼ <b>SELECT CHANNEL</b></span>
            <span>OK <b>WATCH CHANNEL</b></span>
            <span>◀ ▶ <b>CHANGE TIME</b></span>
            <span>BACK <b>CLOSE GUIDE</b></span>
          </footer>
        </section>
      )}

      {menuOpen && (
        <section className="bb-tv-menu-overlay" role="dialog" aria-modal="true" aria-label="Blank Box TV menu" data-testid="tv-menu-overlay">
          <div className="bb-tv-menu-panel">
            <div className="bb-tv-menu-brand">BLANK BOX <b>TV</b></div>
            <p className="bb-tv-menu-kicker">YOUR PERSONAL CABLE SYSTEM</p>
            <h2>TELEVISION MENU</h2>
            <p className="bb-tv-menu-current">{currentChannel}{channel && live ? `  ·  ${live.program.title}` : ''}</p>
            <div className="bb-tv-menu-actions">
              <button type="button" data-testid="tv-menu-return" onClick={onCloseMenu}>RETURN TO BROADCAST</button>
              <button type="button" data-testid="tv-menu-build" onClick={onNew}>EDIT / ADD CHANNELS</button>
              <button type="button" data-testid="tv-menu-demand" onClick={onDemand}>ON DEMAND LIBRARY</button>
              <button type="button" data-testid="tv-menu-settings" onClick={onSettings}>SYSTEM SETTINGS</button>
              <button type="button" data-testid="tv-menu-last" onClick={onLast}>LAST CHANNEL</button>
              <button type="button" data-testid="tv-menu-surprise" onClick={onSurprise}>SURPRISE ME</button>
              <button type="button" data-testid="tv-menu-help" onClick={onHelp}>REMOTE CONTROL HELP</button>
            </div>
            <div className="bb-tv-menu-foot">D-PAD TO MOVE · OK TO SELECT · BACK TO RETURN</div>
          </div>
        </section>
      )}
    </main>
  )
}
