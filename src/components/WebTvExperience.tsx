import type { RefObject } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Channel, Prefs, Program } from '../types.ts'
import { clock, padChannel } from '../lib/format.ts'
import { liveSlot, nextSlot } from '../lib/schedule.ts'
import { Guide } from './Guide.tsx'
import { CastButton, Player } from './Player.tsx'
interface WebTvExperienceProps {
  channels: Channel[]
  channel: Channel | null
  currentId: string | null
  now: number
  vod: Program | null
  prefs: Prefs
  castTarget: { program: Program; offsetSec: number } | null
  screenRef: RefObject<HTMLDivElement | null>
  onExitVod: () => void
  onCastTargetChange: (target: { program: Program; offsetSec: number } | null) => void
  onProgramDuration: (programId: string, seconds: number) => void
  onTune: (id: string) => void
  onStep: (dir: 1 | -1) => void
  onNew: () => void
  onEdit: (id: string) => void
  onMute: () => void
  onVolume: (volume: number) => void
  onFullscreen: () => void
  onCrt: () => void
  onAspect: () => void
  onRate: () => void
  onLogo: () => void
  onLast: () => void
  onHelp: () => void
  onDigit: (digit: string) => void
  dial: string
}

export function WebTvExperience({
  channels,
  channel,
  currentId,
  now,
  vod,
  prefs,
  castTarget,
  screenRef,
  onExitVod,
  onCastTargetChange,
  onProgramDuration,
  onTune,
  onStep,
  onNew,
  onEdit,
  onMute,
  onVolume,
  onFullscreen,
  onCrt,
  onAspect,
  onRate,
  onLogo,
  onLast,
  onHelp,
  onDigit,
  dial,
}: WebTvExperienceProps) {
  const live = channel ? liveSlot(channel, now) : null
  const next = channel ? nextSlot(channel, now) : null
  const secondsLeft = live ? Math.max(0, Math.ceil((live.endMs - now) / 1000)) : 0
  const percent = live ? Math.min(100, Math.max(0, ((now - live.startMs) / (live.endMs - live.startMs)) * 100)) : 0
  function scrollToGuide() {
    document.getElementById('guide')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="bb-tv-console" data-testid="web-tv-receiver">
      <div className="bb-tv-main-grid">
        <section className="bb-tv-broadcast">
          <div className="bb-tv-screen-bezel">
            <div className="bb-tv-screen-inner">
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
                onUnmute={() => onVolume(Math.max(prefs.volume, 0.4))}
                onCastTargetChange={onCastTargetChange}
                onProgramDuration={onProgramDuration}
              />
              {dial && <div className="bb-tv-dial" aria-hidden="true">{dial}</div>}
            </div>
          </div>

          <div className="bb-tv-now-playing">
            <div className="bb-program-ident">
              <span className="bb-program-live">LIVE</span>
              <span className="bb-program-channel">{channel ? 'CH ' + padChannel(channel.number) + '  /  ' + channel.callsign : 'NO CHANNEL'}</span>
            </div>
            <div className="bb-program-copy">
              <strong>{vod?.title || live?.program.title || 'Your television starts here'}</strong>
              <span>{channel ? channel.name : 'Add a channel to begin broadcasting'}</span>
            </div>
            <div className="bb-program-next">
              <span className="bb-micro-label">UP NEXT</span>
              <strong>{next?.program.title || '—'}</strong>
              <span>{live ? Math.floor(secondsLeft / 60) + ' MIN REMAINING' : 'STANDBY'}</span>
            </div>
          </div>
          <div className="bb-program-progress"><span style={{ width: percent + '%' }} /></div>

        </section>

        <aside className="bb-cable-receiver" data-testid="cable-remote">
          <div className="bb-receiver-brand">
            <div className="bb-receiver-brand-copy">
              <strong>BLANK BOX</strong>
              <small>DIGITAL CABLE TERMINAL · 1998</small>
            </div>
            <span className="bb-power-led" title="Power on" />
          </div>

          <div className="bb-receiver-display">
            <div className="bb-led-channel">{channel ? padChannel(channel.number) : '---'}</div>
            <div className="bb-led-info">
              <span>{channel ? channel.callsign : 'STANDBY'}</span>
              <span>{prefs.muted ? 'MUTE' : 'STEREO'}</span>
              <span className="bb-led-clock">{clock(now)}</span>
            </div>
          </div>

          <div className="bb-remote-footer">
            <button type="button" onClick={onNew} className="bb-add-channel" data-testid="tv-add-channel">ADD CH</button>
            <button type="button" onClick={() => channel && onEdit(channel.id)} disabled={!channel} className="bb-edit-channel" data-testid="tv-edit-channel">EDIT CH</button>
            <button type="button" onClick={onLast} className="bb-last-channel" data-testid="tv-last-channel">LAST</button>
          </div>

          <div className="bb-remote-section-label">CHANNEL CONTROL</div>
          <div className="bb-channel-rockers">
            <button type="button" aria-label="Channel up" title="Channel up" data-testid="tv-channel-up" onClick={() => onStep(1)}> 
              <ChevronUp size={22} /><b>CH +</b>
            </button>
            <button type="button" aria-label="Channel down" title="Channel down" data-testid="tv-channel-down" onClick={() => onStep(-1)}> 
              <ChevronDown size={22} /><b>CH −</b>
            </button>
          </div>

          <div className="bb-remote-section-label">DIRECT CHANNEL ACCESS</div>
          <div className="bb-number-pad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'LAST', '0', 'GUIDE'].map((key) => (
              <button
                type="button"
                key={key}
                data-testid={key === 'LAST' ? 'tv-last-channel' : key === 'GUIDE' ? 'tv-open-guide' : 'tv-digit-' + key}
                onClick={() => {
                  if (key === 'LAST') onLast()
                  else if (key === 'GUIDE') scrollToGuide()
                  else onDigit(key)
                }}
                className={key === 'LAST' || key === 'GUIDE' ? 'bb-number-function' : ''}
              >
                {key}
              </button>
            ))}
          </div>

            {castTarget && (
              <div className="bb-receiver-cast" data-testid="remote-cast-slot">
                <CastButton program={castTarget.program} offsetSec={castTarget.offsetSec} />
              </div>
            )}

          <details className="bb-remote-advanced">
            <summary>MORE CONTROLS</summary>
            <div className="bb-remote-section-label">SOUND & PICTURE</div>
            <div className="bb-control-grid bb-control-grid-wide">
              <button type="button" onClick={onMute} data-testid="tv-mute">{prefs.muted ? 'SOUND ON' : 'MUTE'}</button>
              <button type="button" onClick={() => onVolume(Math.max(0, Math.round((prefs.volume - 0.1) * 10) / 10))}>VOL −</button>
              <button type="button" onClick={() => onVolume(Math.min(1, Math.round((prefs.volume + 0.1) * 10) / 10))}>VOL +</button>
              <button type="button" onClick={onFullscreen} data-testid="tv-fullscreen">FULL SCREEN</button>
              <button type="button" onClick={onCrt} data-testid="tv-crt">CRT {prefs.crt ? 'ON' : 'OFF'}</button>
              <button type="button" onClick={onAspect} data-testid="tv-aspect">{prefs.aspect}</button>
              <button type="button" onClick={onRate} data-testid="tv-speed">RATE {prefs.rate}×</button>
              <button type="button" onClick={onLogo} data-testid="tv-logo">LOGO {prefs.logo ? 'ON' : 'OFF'}</button>
            </div>
            <div className="bb-receiver-tiny">
              <button type="button" onClick={onHelp}>REMOTE HELP</button>
            </div>
          </details>
        </aside>
      </div>

      <section className="bb-tv-guide-section">
        <Guide
          channels={channels}
          currentId={currentId}
          now={now}
          title="PREVUE"
          favs={prefs.favs}
          onTune={onTune}
          onNew={onNew}
        />
      </section>

    </div>
  )
}
