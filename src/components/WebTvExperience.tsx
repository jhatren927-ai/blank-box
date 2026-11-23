import type { RefObject } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Clock3,
  Disc3,
  Maximize,
  Minus,
  Plus,
  Power,
  Pencil,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { Channel, Prefs, Program } from '../types.ts'
import { clock, padChannel } from '../lib/format.ts'
import { liveSlot, nextSlot } from '../lib/schedule.ts'
import { Guide, Ticker } from './Guide.tsx'
import { CastButton, Player } from './Player.tsx'
import { lookById } from '../lib/looks.ts'

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
  onSurprise: () => void
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
  onSurprise,
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
      <Ticker channels={channels} now={now} />

      <div className="bb-tv-statusline">
        <div className="bb-tv-status-left">
          <span className="bb-on-air"><span /> ON THE AIR</span>
          <span className="bb-tv-divider">|</span>
          <span>{channel ? 'LOCAL CABLE SERVICE' : 'NO STATION SELECTED'}</span>
          <span className="bb-tv-divider">|</span>
          <span>{prefs.aspect} PICTURE</span>
        </div>
        <div className="bb-tv-status-right">
          <Clock3 size={15} />
          <span>{clock(now)}</span>
          <span className="bb-stereo">STEREO</span>
        </div>
      </div>

      <div className="bb-tv-main-grid">
        <section className="bb-tv-broadcast">
          <div className="bb-tv-screen-heading">
            <div>
              <span className="bb-micro-label">NOW TUNED TO</span>
              <h1>{channel ? channel.name : 'BLANK BOX TELEVISION'}</h1>
            </div>
            <div className="bb-channel-bug">
              <span>CH</span>
              <strong>{channel ? padChannel(channel.number) : '---'}</strong>
            </div>
          </div>

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
              <div className="bb-tv-osd" aria-hidden="true">
                <div className="bb-tv-osd-top">
                  <span className="bb-osd-channel">{channel ? padChannel(channel.number) : '000'}</span>
                  <span className="bb-osd-callsign">{channel?.callsign || 'BLANK BOX'}</span>
                  <span className="bb-osd-clock">{clock(now)}</span>
                </div>
                {dial && <div className="bb-tv-dial">{dial}</div>}
                <div className="bb-tv-osd-bottom">
                  <span>{vod ? 'VIDEO ON DEMAND' : live?.program.title || 'PLEASE SELECT A CHANNEL'}</span>
                  <span>{prefs.muted ? 'MUTED' : 'STEREO'}</span>
                </div>
              </div>
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

          <div className="bb-station-strip">
            <div className="bb-strip-title"><Tv size={15} /> YOUR CHANNELS</div>
            <div className="bb-station-list">
              {channels.length === 0 ? (
                <button type="button" className="bb-station-add" onClick={onNew}>
                  <Plus size={18} /> CREATE YOUR FIRST CHANNEL
                </button>
              ) : channels.slice().sort((a, b) => a.number - b.number).map((item) => (
                <div key={item.id} className={'bb-station-card' + (item.id === currentId ? ' is-current' : '')}>
                  <button type="button" onClick={() => onTune(item.id)} className="bb-station-tune">
                    <span className="bb-station-number">{padChannel(item.number)}</span>
                    <span className={'bb-station-callsign ' + lookById(item.look).bug}>{item.callsign}</span>
                    <span className="bb-station-name">{item.name}</span>
                  </button>
                  <button type="button" className="bb-station-edit" aria-label={'Edit ' + item.name} onClick={() => onEdit(item.id)}>
                    <Pencil size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="bb-cable-receiver" data-testid="cable-remote">
          <div className="bb-receiver-brand">
            <div className="bb-receiver-logo">BB<span>TV</span></div>
            <div>
              <strong>BLANK BOX</strong>
              <small>DIGITAL CABLE RECEIVER · MODEL 1995</small>
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

          <div className="bb-remote-section-label">CHANNEL CONTROL</div>
          <div className="bb-channel-rockers">
            <button type="button" data-testid="tv-channel-up" onClick={() => onStep(1)}>
              <ChevronUp size={25} /><span>CHANNEL</span><b>UP</b>
            </button>
            <button type="button" data-testid="tv-channel-down" onClick={() => onStep(-1)}>
              <ChevronDown size={25} /><span>CHANNEL</span><b>DOWN</b>
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

          <div className="bb-remote-section-label">SOUND & PICTURE</div>
          <div className="bb-control-grid bb-control-grid-wide">
            <button type="button" onClick={onMute} data-testid="tv-mute">
              {prefs.muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              {prefs.muted ? 'SOUND ON' : 'MUTE'}
            </button>
            <button type="button" onClick={() => onVolume(Math.max(0, Math.round((prefs.volume - 0.1) * 10) / 10))}>
              <Minus size={17} /> VOL
            </button>
            <button type="button" onClick={() => onVolume(Math.min(1, Math.round((prefs.volume + 0.1) * 10) / 10))}>
              <Plus size={17} /> VOL
            </button>
            <button type="button" onClick={onFullscreen} data-testid="tv-fullscreen">
              <Maximize size={17} /> FULL SCREEN
            </button>
            <button type="button" onClick={onCrt} data-testid="tv-crt">
              <Disc3 size={17} /> CRT {prefs.crt ? 'ON' : 'OFF'}
            </button>
            <button type="button" onClick={onAspect} data-testid="tv-aspect">
              <Tv size={17} /> {prefs.aspect}
            </button>
            <button type="button" onClick={onRate} data-testid="tv-speed">
              <Disc3 size={17} /> SPEED {prefs.rate}×
            </button>
            <button type="button" onClick={onLogo} data-testid="tv-logo">
              <Tv size={17} /> LOGO {prefs.logo ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="bb-remote-footer">
            <button type="button" onClick={onNew} className="bb-add-channel" data-testid="tv-add-channel">
              <Plus size={17} /> ADD CHANNEL
            </button>
            <button type="button" onClick={onSurprise} className="bb-surprise" data-testid="tv-surprise">
              <Power size={16} /> SURPRISE ME
            </button>
          </div>

          {castTarget && (
            <div className="bb-receiver-cast" data-testid="remote-cast-slot">
              <CastButton program={castTarget.program} offsetSec={castTarget.offsetSec} />
            </div>
          )}

          <div className="bb-receiver-tiny">
            <span><span className="bb-green-dot" /> SIGNAL READY</span>
            <button type="button" onClick={onHelp}>REMOTE HELP</button>
          </div>
        </aside>
      </div>

      <section className="bb-tv-guide-section">
        <div className="bb-guide-heading">
          <div><span className="bb-micro-label">WHAT'S ON YOUR NETWORK</span><h2>TELEVISION PROGRAM GUIDE</h2></div>
          <div className="bb-guide-key"><span>▲▼</span> SELECT A CHANNEL <span>ENTER</span> TUNE IN</div>
        </div>
        <Guide
          channels={channels}
          currentId={currentId}
          now={now}
          title="BLANK BOX"
          favs={prefs.favs}
          onTune={onTune}
        />
      </section>
      <div className="bb-tv-footer">
        <span>BLANK BOX CABLE TELEVISION</span>
        <span>LOCAL CHANNELS · YOUR NETWORK · YOUR RULES</span>
        <span>{channels.length} STATIONS AVAILABLE</span>
      </div>
    </div>
  )
}
