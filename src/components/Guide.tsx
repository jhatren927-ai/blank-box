import { useState } from 'react'
import type { Channel } from '../types.ts'
import { clock, dayLabel, padChannel } from '../lib/format.ts'
import { lookById } from '../lib/looks.ts'
import { guideWindow, liveSlot, slotsCovering } from '../lib/schedule.ts'

export function Ticker({ channels, now }: { channels: Channel[]; now: number }) {
  const line =
    channels
      .map((channel) => {
        const live = liveSlot(channel, now)
        return live ? `CH ${padChannel(channel.number)} ${channel.callsign}: ${live.program.title}` : null
      })
      .filter(Boolean)
      .join('   ★   ') || 'Make a channel and it will scroll by right here.'
  return (
    <div data-testid="news-ticker" className="flex h-10 items-center overflow-hidden border-y-2 border-black bg-prevue-ticker">
      <span className="z-10 flex h-full shrink-0 items-center bg-red-600 px-3 font-heading text-xs font-black uppercase tracking-widest text-white">
        On now
      </span>
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <div className="animate-ticker flex whitespace-nowrap font-mono text-sm text-yellow-200">
          <span className="px-8">{line}</span>
          <span className="px-8">{line}</span>
        </div>
      </div>
    </div>
  )
}

export function Guide({
  channels,
  currentId,
  now,
  title,
  favs,
  onTune,
}: {
  channels: Channel[]
  currentId: string | null
  now: number
  title: string
  favs: string[]
  onTune: (id: string) => void
}) {
  const [scroll, setScroll] = useState(true)
  const [favOnly, setFavOnly] = useState(false)
  const guide = guideWindow(now)
  const shown = (favOnly ? channels.filter((channel) => favs.includes(channel.id)) : channels)
    .slice()
    .sort((a, b) => a.number - b.number)
  const columns = 6
  const span = guide.end - guide.start
  const marker = ((now - guide.start) / span) * 100
  const scrolling = scroll && shown.length > 4

  return (
    <section
      id="guide"
      data-testid="prevue-grid"
      className="overflow-hidden rounded-md border-2 border-black bg-prevue-deep shadow-[0_20px_50px_-25px_rgba(0,34,136,0.9)]"
    >
      <div className="flex items-center justify-between gap-3 bg-prevue px-3 py-2">
        <h2 className="font-heading text-lg font-black uppercase tracking-tight text-prevue-yellow text-glow sm:text-xl">
          {title} Prevue Guide
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="guide-favs-toggle"
            disabled={favs.length === 0}
            aria-pressed={favOnly}
            onClick={() => setFavOnly((value) => !value)}
            className={`bevel rounded-sm px-2 py-1 font-mono text-[10px] font-bold ${favOnly ? 'bg-yellow-400 text-black' : 'bg-[#001144] text-yellow-300'}`}
          >
            ★ {favOnly ? `MY ${favs.length}` : 'FAVS'}
          </button>
          <button
            type="button"
            data-testid="guide-autoscroll-toggle"
            onClick={() => setScroll((value) => !value)}
            className="bevel hidden rounded-sm bg-[#001144] px-2 py-1 font-mono text-[10px] font-bold text-yellow-300 sm:inline-block"
          >
            SCROLL: {scroll ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-8 text-center font-mono text-sm text-blue-100">
          No channels yet. Tap an empty channel and type what you want to watch.
        </p>
      ) : (
        <>
          <ul data-testid="guide-mobile-list" className="max-h-[460px] divide-y-2 divide-black overflow-y-auto sm:hidden">
            {shown.map((channel) => {
              const live = liveSlot(channel, now)
              const upcoming = slotsCovering(channel, now, now + 6 * 60 * 60 * 1000)[1]
              const active = channel.id === currentId
              const left = live ? Math.max(0, Math.round((live.endMs - now) / 60000)) : 0
              return (
                <li key={channel.id}>
                  <button
                    type="button"
                    data-testid="guide-mobile-tune"
                    onClick={() => onTune(channel.id)}
                    className={`grid w-full grid-cols-[52px_1fr] gap-2 px-2 py-3 text-left ${active ? 'bg-yellow-400 text-black' : channel.number % 2 ? 'bg-prevue-deep' : 'bg-prevue-row'}`}
                  >
                    <span className="flex flex-col items-start gap-1">
                      <span className={`font-mono text-lg font-bold leading-none ${active ? 'text-black' : 'text-prevue-yellow'}`}>
                        {padChannel(channel.number)}
                      </span>
                      <span className={`max-w-full truncate rounded-[2px] border px-1 font-heading text-[9px] font-extrabold ${lookById(channel.look).bug}`}>
                        {channel.callsign}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className={`block truncate font-heading text-sm font-bold uppercase ${active ? 'text-black' : 'text-white'}`}>
                        {live?.program.title ?? 'Off the air'}
                      </span>
                      {live && (
                        <span className={`block truncate font-mono text-[11px] ${active ? 'text-black/70' : 'text-yellow-300'}`}>
                          ON NOW · {left} min left
                        </span>
                      )}
                      {upcoming && (
                        <span className={`block truncate font-mono text-[11px] ${active ? 'text-black/70' : 'text-blue-200'}`}>
                          {clock(upcoming.startMs)} NEXT · {upcoming.program.title}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <div className="min-w-[680px]">
              <div className="grid grid-cols-[120px_1fr] border-y-2 border-black bg-[#001144]">
                <div data-testid="guide-time-label" className="border-r-2 border-black px-2 py-1 font-mono text-xs font-bold text-yellow-300">
                  {dayLabel(guide.start)}
                </div>
                <div className="grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
                  {Array.from({ length: columns }, (_, index) => (
                    <div key={index} className="border-r border-blue-900 px-2 py-1 font-mono text-xs font-bold text-white">
                      {clock(guide.start + index * 30 * 60 * 1000)}
                    </div>
                  ))}
                </div>
              </div>
              <div
                data-testid="guide-viewport"
                className={`relative ${scrolling ? 'h-[336px] overflow-hidden' : 'max-h-[420px] overflow-y-auto'}`}
              >
                <div
                  className={scrolling ? 'animate-guide-scroll hover:[animation-play-state:paused]' : ''}
                  style={scrolling ? { animationDuration: `${Math.max(30, shown.length * 4)}s` } : undefined}
                >
                  {shown.map((channel) => (
                    <GuideRow
                      key={channel.id}
                      channel={channel}
                      active={channel.id === currentId}
                      now={now}
                      windowStart={guide.start}
                      span={span}
                      onTune={onTune}
                    />
                  ))}
                  {scrolling &&
                    shown.map((channel) => (
                      <GuideRow
                        key={`dup-${channel.id}`}
                        channel={channel}
                        active={channel.id === currentId}
                        now={now}
                        windowStart={guide.start}
                        span={span}
                        onTune={onTune}
                        dup
                      />
                    ))}
                </div>
                <div className="pointer-events-none absolute inset-y-0 left-[120px] right-0">
                  <div
                    data-testid="guide-now-marker"
                    className="absolute inset-y-0 w-0.5 bg-red-500 shadow-[0_0_8px_#ef4444]"
                    style={{ left: `${marker}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function GuideRow({
  channel,
  active,
  now,
  windowStart,
  span,
  onTune,
  dup = false,
}: {
  channel: Channel
  active: boolean
  now: number
  windowStart: number
  span: number
  onTune: (id: string) => void
  dup?: boolean
}) {
  const slots = slotsCovering(channel, windowStart, windowStart + span)
  return (
    <div
      data-testid={dup ? undefined : 'guide-row'}
      className={`grid grid-cols-[120px_1fr] border-b-2 border-black ${channel.number % 2 ? 'bg-prevue-deep' : 'bg-prevue-row'}`}
    >
      <button
        type="button"
        data-testid={dup ? undefined : 'guide-tune'}
        onClick={() => onTune(channel.id)}
        className={`flex flex-col items-start justify-center gap-1 border-r-2 border-black px-2 py-2 text-left hover:bg-[#0000aa] ${active ? 'bg-yellow-400 hover:bg-yellow-300' : ''}`}
      >
        <span className={`font-mono text-xl font-bold leading-none ${active ? 'text-black' : 'text-prevue-yellow'}`}>
          {padChannel(channel.number)}
        </span>
        <span className={`rounded-[2px] border px-1 font-heading text-[10px] font-extrabold tracking-wider ${lookById(channel.look).bug}`}>
          {channel.callsign}
        </span>
      </button>
      <div className="relative h-16 overflow-hidden">
        {slots.length === 0 && (
          <div className="flex h-full items-center px-3 font-mono text-xs uppercase text-blue-200">Off the air</div>
        )}
        {slots.map((slot, index) => {
          const left = Math.max(slot.startMs, windowStart)
          const right = Math.min(slot.endMs, windowStart + span)
          const onNow = slot.startMs <= now && now < slot.endMs
          return (
            <button
              key={`${slot.program.id}-${slot.startMs}-${index}`}
              type="button"
              title={slot.program.title}
              onClick={() => onTune(channel.id)}
              className={`absolute top-0 h-full overflow-hidden border-r-2 border-black px-2 py-1.5 text-left hover:bg-[#0000cc] ${onNow ? 'bg-[#0a1aa8]' : ''}`}
              style={{ left: `${((left - windowStart) / span) * 100}%`, width: `${((right - left) / span) * 100}%` }}
            >
              <p className="line-clamp-2 font-heading text-[11px] font-bold uppercase leading-tight text-white sm:text-xs">
                {slot.startMs < windowStart && <span className="text-prevue-yellow">◄ </span>}
                {slot.program.title}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-yellow-300">{clock(slot.startMs)}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
