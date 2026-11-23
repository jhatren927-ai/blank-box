import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
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
  onNew,
  onEdit,
}: {
  channels: Channel[]
  currentId: string | null
  now: number
  title: string
  favs: string[]
  onTune: (id: string) => void
  onEdit?: (id: string) => void
  onNew?: () => void
  onEdit?: (id: string) => void
}) {
  const [favOnly, setFavOnly] = useState(false)
  const guide = guideWindow(now)
  const shown = (favOnly ? channels.filter((channel) => favs.includes(channel.id)) : channels)
    .slice()
    .sort((a, b) => a.number - b.number)
  const columns = 6
  const span = guide.end - guide.start
  const marker = ((now - guide.start) / span) * 100
  // Render each channel exactly once. Manual scrolling keeps the guide stable
  // and avoids duplicate DOM rows that made small lineups jump or loop oddly.
  const copiesPerLoop = 1
  const shouldAutoScroll = false
  const scrollDuration = `${Math.max(20, copiesPerLoop * shown.length * 3.2)}s`
  const renderRows = (dup = false, copy = 0) => shown.map((channel) => (
    <GuideRow
      key={`${dup ? 'loop-' : ''}${copy}-${channel.id}`}
      channel={channel}
      active={channel.id === currentId}
      now={now}
      windowStart={guide.start}
      span={span}
      onTune={onTune}
      onEdit={onEdit}
      dup={dup || copy > 0}
    />
  ))

  return (
    <section
      id="guide"
      data-testid="prevue-grid"
      className="overflow-hidden rounded-md border-2 border-black bg-prevue-deep shadow-[0_20px_50px_-25px_rgba(0,34,136,0.9)]"
    >
      <div className="flex items-center justify-between gap-3 bg-prevue px-3 py-2">
        <h2 className="font-heading text-lg font-black uppercase tracking-tight text-prevue-yellow text-glow sm:text-xl">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
          {onNew && <button type="button" data-testid="tv-add-channel" onClick={onNew} className="rounded-sm border border-[#d7b65f] bg-[#d7b65f] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-[#151b2b] hover:bg-[#f0d47f]"> <Plus size={13} className="mr-1 inline" /> ADD CHANNEL</button>}
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
          </div>
        </div>
      {shown.length === 0 ? (
        <p className="px-4 py-8 text-center font-mono text-sm text-blue-100">
          No channels yet. Tap an empty channel and type what you want to watch.
        </p>
      ) : (
        <>
          <div data-testid="guide-mobile-list" className="bb-guide-mobile-list max-h-[min(58vh,520px)] divide-y divide-black overflow-y-auto sm:hidden">
            <div
              data-testid="guide-mobile-auto-scroll"
              className={shouldAutoScroll ? 'animate-guide-scroll' : ''}
              style={shouldAutoScroll ? { animationDuration: scrollDuration } : undefined}
            >
              {Array.from({ length: copiesPerLoop }, (_, copy) => (
                <ul key={copy} aria-hidden={copy >= copiesPerLoop} className="divide-y-2 divide-black">
                  {shown.map((channel) => {
                    const live = liveSlot(channel, now)
                    const upcoming = slotsCovering(channel, now, now + 6 * 60 * 60 * 1000)[1]
                    const active = channel.id === currentId
                    const left = live ? Math.max(0, Math.round((live.endMs - now) / 60000)) : 0
                    return (
                      <li key={channel.id}>
                        <button
                          type="button"
                          data-testid={copy === 0 ? 'guide-mobile-tune' : undefined}
                          tabIndex={copy === 0 ? 0 : -1}
                          onClick={() => onTune(channel.id)}
                          className={`grid min-h-[88px] w-full grid-cols-[64px_1fr] gap-3 px-3 py-3 text-left ${active ? 'bg-[#e4c66e] text-[#151b2b]' : channel.number % 2 ? 'bg-[#06245c]' : 'bg-[#0b3476]'}`}
                        >
                          <span className="flex flex-col items-start gap-1">
                            <span className={`font-mono text-xl font-bold leading-none ${active ? 'text-black' : 'text-prevue-yellow'}`}>
                              {padChannel(channel.number)}
                            </span>
                            <span className={`max-w-full truncate rounded-[2px] border border-white/30 px-1 font-heading text-[9px] font-extrabold text-white ${lookById(channel.look).bug}`}>
                              {channel.callsign}
                            </span>
                          </span>
                          <span className="min-w-0">
                            <span className={`mb-0.5 block truncate font-mono text-[10px] font-semibold uppercase tracking-wide ${active ? 'text-black/70' : 'text-[#f0d47f]'}`}>{channel.name}</span>
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
              ))}
            </div>
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[180px_minmax(0,1fr)] border-y border-[#6688b8] bg-[#061b4c]">
                <div data-testid="guide-time-label" className="border-r border-[#6688b8] px-3 py-2 font-mono text-xs font-bold text-[#f0d47f]">
                  {dayLabel(guide.start)}
                </div>
                <div className="grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
                  {Array.from({ length: columns }, (_, index) => (
                    <div key={index} className="border-r border-[#31558b] px-3 py-2 font-mono text-sm font-bold text-[#f0d47f]">
                      {clock(guide.start + index * 30 * 60 * 1000)}
                    </div>
                  ))}
                </div>
              </div>
              <div
                data-testid="guide-viewport"
                role="region"
                aria-label="Scrollable television channel guide"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'PageDown' || event.key === 'PageUp') {
                    event.preventDefault()
                    const amount = event.key === 'PageDown' || event.key === 'PageUp' ? event.currentTarget.clientHeight * 0.85 : 88
                    event.currentTarget.scrollBy({ top: event.key === 'ArrowUp' || event.key === 'PageUp' ? -amount : amount, behavior: 'smooth' })
                  }
                }}
                className="bb-guide-scroll relative h-[min(56vh,620px)] min-h-[440px] overflow-y-auto overflow-x-hidden overscroll-y-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d47f]"
              >
                <div
                  data-testid="guide-auto-scroll"
                  className={shouldAutoScroll ? 'animate-guide-scroll' : ''}
                  style={shouldAutoScroll ? { animationDuration: scrollDuration } : undefined}
                >
                  {Array.from({ length: copiesPerLoop }, (_, copy) => renderRows(false, copy))}
                  {shouldAutoScroll && Array.from(
                    { length: copiesPerLoop },
                    (_, copy) => renderRows(true, copy),
                  )}
                </div>
                <div className="pointer-events-none absolute inset-y-0 left-[180px] right-0">
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
  onEdit,
  dup = false,
}: {
  channel: Channel
  active: boolean
  now: number
  windowStart: number
  span: number
  onTune: (id: string) => void
  onEdit?: (id: string) => void
  dup?: boolean
}) {
  const slots = slotsCovering(channel, windowStart, windowStart + span)
  return (
    <div
      data-testid={dup ? undefined : 'guide-row'}
      className={`grid grid-cols-[180px_minmax(0,1fr)] border-b border-[#31558b] ${channel.number % 2 ? 'bg-[#08245c]' : 'bg-[#0b3476]'}`}
    >
      <div className={`flex min-w-0 items-stretch border-r border-[#31558b] ${active ? 'bg-[#e4c66e]' : 'bg-[#061b4c]'}`}>
        <button
          type="button"
          data-testid={dup ? undefined : 'guide-tune'}
          onClick={() => onTune(channel.id)}
          className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1 px-3 py-2 text-left hover:bg-[#17458b]"
        >
          <span className={`font-mono text-xl font-bold leading-none ${active ? 'text-[#171d2b]' : 'text-[#f0d47f]'}`}>
            {padChannel(channel.number)}
          </span>
          <span className="max-w-full truncate font-heading text-[10px] font-extrabold tracking-wider text-white">
            {channel.callsign}
          </span>
          <span className={`bb-station-name max-w-full truncate font-mono text-[10px] ${active ? 'text-[#171d2b]' : 'text-[#c6d5ec]'}`}>
            {channel.name}
          </span>
        </button>
        {onEdit && <button type="button" aria-label={`Edit ${channel.name}`} title={`Edit ${channel.name}`} onClick={() => onEdit(channel.id)} className="w-8 shrink-0 border-l border-[#31558b] text-[#d6c17d] hover:bg-[#17458b] hover:text-white"><Pencil size={13} className="mx-auto" /></button>}
      </div>
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
