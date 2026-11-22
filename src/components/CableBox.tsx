import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Maximize,
  Monitor,
  Pencil,
  Plus,
  Shuffle,
  Star,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { Channel, Prefs } from '../types.ts'
import { lengthLabel, padChannel } from '../lib/format.ts'
import { lookById } from '../lib/looks.ts'
import { loopSeconds } from '../lib/schedule.ts'

const RATES = [0.75, 1, 1.25, 1.5, 2]
const button =
  'bevel flex h-12 items-center justify-center gap-1.5 rounded-sm bg-[#1b2333] font-mono text-xs font-bold text-slate-100 hover:bg-[#263149] active:translate-y-0.5'

export function CableBox({
  channels,
  currentId,
  prefs,
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
  onFav,
  onSurprise,
  onHelp,
  onShake,
  onClearRecent,
}: {
  channels: Channel[]
  currentId: string | null
  prefs: Prefs
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
  onFav: (id: string) => void
  onSurprise: () => void
  onHelp: () => void
  onShake: () => void
  onClearRecent: () => void
}) {
  const ordered = channels.slice().sort((a, b) => a.number - b.number)
  const recent = prefs.recent
    .map((id) => channels.find((channel) => channel.id === id))
    .filter((channel): channel is Channel => !!channel)
  const empties = Math.max(0, 4 - ordered.length)

  return (
    <div data-testid="remote-deck" className="rounded-md border border-[#1e293b] bg-gradient-to-b from-[#121827] to-[#0a0e18] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-heading text-xs font-extrabold uppercase tracking-[0.25em] text-slate-400">Cable Box</p>
        <button type="button" data-testid="remote-help-button" onClick={onHelp} className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-yellow-300">
          <HelpCircle className="size-4" /> HELP
        </button>
      </div>
      {recent.length > 0 && (
        <div data-testid="recent-row" className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">Recently watched</p>
            <button type="button" onClick={onClearRecent} className="font-mono text-[10px] text-slate-500 hover:text-red-300">
              CLEAR
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {recent.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => onTune(channel.id)}
                className="bevel flex shrink-0 items-center gap-1.5 rounded-sm bg-[#1b2333] px-2 py-1"
              >
                <span className="font-mono text-xs font-bold text-yellow-300">{padChannel(channel.number)}</span>
                <span className={`rounded-[2px] border px-1 font-mono text-[9px] font-bold ${lookById(channel.look).bug}`}>
                  {channel.callsign}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div data-testid="channel-list" className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {ordered.map((channel) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            active={channel.id === currentId}
            fav={prefs.favs.includes(channel.id)}
            onTune={onTune}
            onFav={onFav}
            onEdit={onEdit}
          />
        ))}
        {Array.from({ length: empties }, (_, index) => (
          <button
            key={index}
            type="button"
            data-testid={ordered.length === 0 && index === 0 ? 'new-channel' : 'empty-slot'}
            onClick={onNew}
            className="flex h-14 w-full items-center gap-3 rounded-sm border border-dashed border-slate-600 px-3 text-left text-slate-300 hover:border-yellow-300 hover:text-yellow-200"
          >
            <Plus className="size-5" />
            <span>
              <span className="block font-heading text-base font-bold">Empty channel</span>
              <span className="font-mono text-[11px] text-slate-500">Tap to make one</span>
            </span>
          </button>
        ))}
        {ordered.length > 0 && (
          <button
            type="button"
            data-testid="new-channel"
            onClick={onNew}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-sm bg-yellow-400 font-heading text-base font-black uppercase text-black"
          >
            <Plus className="size-5" /> Add a channel
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" data-testid="channel-up-button" className={button} onClick={() => onStep(1)}>
          <ChevronUp className="size-5" /> CH
        </button>
        <button type="button" data-testid="channel-down-button" className={button} onClick={() => onStep(-1)}>
          <ChevronDown className="size-5" /> CH
        </button>
        <button type="button" data-testid="mute-toggle" className={`${button} ${prefs.muted ? 'text-red-300' : ''}`} onClick={onMute}>
          {prefs.muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          {prefs.muted ? 'MUTED' : 'MUTE'}
        </button>
        <button type="button" data-testid="fullscreen-button" className={button} onClick={onFullscreen}>
          <Maximize className="size-5" /> FULL
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="font-mono text-[10px] font-bold text-slate-400">VOL</span>
        <div data-testid="volume-meter" className="flex flex-1 gap-1">
          {Array.from({ length: 10 }, (_, index) => {
            const level = (index + 1) / 10
            const on = !prefs.muted && prefs.volume >= level - 0.001
            const color = index < 6 ? 'bg-green-500' : index < 8 ? 'bg-yellow-400' : 'bg-red-500'
            return (
              <button
                key={level}
                type="button"
                data-testid={`volume-level-${index + 1}`}
                aria-label={`Volume ${index + 1}`}
                onClick={() => onVolume(level)}
                className={`h-5 flex-1 rounded-[1px] ${color} ${on ? 'opacity-100' : 'opacity-20'}`}
              />
            )
          })}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" data-testid="last-channel-button" className={`${button} text-yellow-300`} onClick={onLast} disabled={recent.length === 0}>
          LAST
        </button>
        <button type="button" data-testid="crt-toggle" className={`${button} ${prefs.crt ? 'text-green-400' : 'text-slate-400'}`} onClick={onCrt}>
          <Tv className="size-4" /> CRT {prefs.crt ? 'ON' : 'OFF'}
        </button>
        <button type="button" data-testid="aspect-toggle" className={button} onClick={onAspect}>
          <Monitor className="size-4" /> {prefs.aspect}
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" data-testid="speed-button" className={button} onClick={onRate}>
          SPEED {RATES.includes(prefs.rate) ? `${prefs.rate}×` : '1×'}
        </button>
        <button type="button" data-testid="logo-toggle-button" className={button} onClick={onLogo}>
          LOGO {prefs.logo ? 'ON' : 'OFF'}
        </button>
        <button type="button" data-testid="surprise-button" className={button} onClick={onSurprise}>
          <Shuffle className="size-4" /> SURPRISE
        </button>
        <button
          type="button"
          data-testid="shake-button"
          className={`${button} ${prefs.shake ? 'text-green-300' : ''}`}
          onClick={onShake}
        >
          SHAKE {prefs.shake ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  )
}

function ChannelRow({
  channel,
  active,
  fav,
  onTune,
  onFav,
  onEdit,
}: {
  channel: Channel
  active: boolean
  fav: boolean
  onTune: (id: string) => void
  onFav: (id: string) => void
  onEdit: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className={`rounded-sm ${active ? 'bg-yellow-400 text-black' : 'bg-[#1b2333] text-slate-100'}`}
    >
      <div className="flex items-center">
        <button
          type="button"
          data-testid={`channel-btn-${channel.number}`}
          onClick={() => onTune(channel.id)}
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-3 text-left"
        >
          <span className="w-8 shrink-0 font-mono text-base font-bold tabular-nums">{padChannel(channel.number)}</span>
          <span className={`shrink-0 rounded-[2px] border px-1 font-mono text-[10px] font-bold ${active ? 'border-black bg-black text-yellow-300' : lookById(channel.look).bug}`}>
            {channel.callsign}
          </span>
          <span className="min-w-0 truncate text-sm font-semibold">{channel.name}</span>
        </button>
        <button type="button" aria-label={`Change ${channel.name}`} onClick={() => onEdit(channel.id)} className="px-2 py-3">
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          data-testid={`channel-fav-${channel.number}`}
          aria-pressed={fav}
          aria-label={fav ? `Unstar ${channel.name}` : `Star ${channel.name}`}
          onClick={() => onFav(channel.id)}
          className="px-2 py-3"
        >
          <Star className={`size-4 ${fav ? 'fill-yellow-300 text-yellow-300' : ''}`} />
        </button>
      </div>
      {open && (
        <p className="px-2 pb-2 font-mono text-[11px] text-slate-300">
          <span className={active ? 'text-black' : 'text-yellow-300'}>{channel.programs.length} shows</span>
          {' · '}
          <span className={active ? 'text-black' : 'text-green-400'}>{lengthLabel(loopSeconds(channel))} loop</span>
        </p>
      )}
    </div>
  )
}

export function useShakeTune(enabled: boolean, onTune: () => void) {
  useEffect(() => {
    if (!enabled) return
    let last = 0
    const onMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity
      if (!acc) return
      const force = Math.abs(acc.x ?? 0) + Math.abs(acc.y ?? 0) + Math.abs(acc.z ?? 0)
      const now = Date.now()
      if (force > 35 && now - last > 1500) {
        last = now
        onTune()
      }
    }
    window.addEventListener('devicemotion', onMotion)
    return () => window.removeEventListener('devicemotion', onMotion)
  }, [enabled, onTune])
}

export function nextRate(rate: number): number {
  const index = RATES.indexOf(rate)
  return RATES[(index + 1) % RATES.length]
}
