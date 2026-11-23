import { useEffect, useRef, useState } from 'react'
import type { Channel } from '../types.ts'
import { clock, dayLabel, padChannel } from '../lib/format.ts'
import { guideWindow, liveSlot, slotsCovering } from '../lib/schedule.ts'
import { usePrevueCrawl } from '../lib/prevueCrawl.ts'

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
}: {
  channels: Channel[]
  currentId: string | null
  now: number
  title: string
  favs: string[]
  onTune: (id: string) => void
  onNew?: () => void
}) {
  const [favOnly, setFavOnly] = useState(false)
  const guide = guideWindow(now)
  const shown = (favOnly ? channels.filter((channel) => favs.includes(channel.id)) : channels)
    .slice()
    .sort((a, b) => a.number - b.number)
  const columns = 3
  const span = guide.end - guide.start
  const guideSurfaceRef = useRef<HTMLDivElement>(null)
  const desktopViewportRef = useRef<HTMLDivElement>(null)
  const desktopFirstCopyRef = useRef<HTMLDivElement>(null)
  const duplicateCopies = usePrevueCrawl(desktopViewportRef, desktopFirstCopyRef, shown.length > 0)

  // The Prevue guide advances only under its own timed crawl. Block all
  // manual wheel and touch-drag scrolling (both axes), using non-passive native
  // listeners so cancellation works reliably in mobile browsers and TV WebViews.
  useEffect(() => {
    const surface = guideSurfaceRef.current
    if (!surface) return

    const preventManualWheel = (event: WheelEvent) => {
      if ((event.deltaX !== 0 || event.deltaY !== 0) && event.cancelable) event.preventDefault()
    }
    const preventManualTouchMove = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault()
    }

    surface.addEventListener('wheel', preventManualWheel, { passive: false })
    surface.addEventListener('touchmove', preventManualTouchMove, { passive: false })

    return () => {
      surface.removeEventListener('wheel', preventManualWheel)
      surface.removeEventListener('touchmove', preventManualTouchMove)
    }
  }, [])

  const renderRows = (duplicate = false) => shown.map((channel) => (
    <GuideRow
      key={(duplicate ? 'loop-' : '') + channel.id}
      channel={channel}
      active={channel.id === currentId}
      now={now}
      windowStart={guide.start}
      span={span}
      onTune={onTune}
      dup={duplicate}
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
          {onNew && (
            <button
              type="button"
              data-testid="guide-add-channel"
              onClick={onNew}
              className="bevel rounded-sm border border-yellow-300 bg-[#b88924] px-3 py-1 font-mono text-[10px] font-black uppercase text-black hover:bg-yellow-300"
            >
              + ADD CH
            </button>
          )}
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
          No channels yet. Select ADD CH to build your first lineup.
        </p>
      ) : (
        <>
          <div ref={guideSurfaceRef} data-testid="guide-surface" className="overflow-hidden" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
            <div className="min-w-0">
              <div className="grid grid-cols-[160px_minmax(0,1fr)] border-y-2 border-black bg-[#001144]">
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
                ref={desktopViewportRef}
                data-testid="guide-viewport"
                role="region"
                aria-label="Automatically advancing television program guide"
                style={{ overflow: 'hidden', overscrollBehavior: 'none', touchAction: 'none' }}
                className="bb-guide-scroll relative h-[min(72vh,760px)] min-h-[420px] overflow-hidden overscroll-none"
              >
                <div data-testid="guide-auto-scroll" className="min-w-0">
                  <div ref={desktopFirstCopyRef}>
                    {renderRows(false)}
                  </div>
                  {Array.from({ length: Math.max(0, duplicateCopies - 1) }, (_, index) => (
                    <div key={`crawl-copy-${index}`} aria-hidden="true">
                      {renderRows(true)}
                    </div>
                  ))}
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
      className={`grid grid-cols-[160px_minmax(0,1fr)] border-b-2 border-black ${channel.number % 2 ? 'bg-prevue-deep' : 'bg-prevue-row'}`}
    >
      <button
        type="button"
        data-testid={dup ? undefined : 'guide-tune'}
        onClick={() => onTune(channel.id)}
        tabIndex={dup ? -1 : undefined}
        className={`bb-guide-channel-button flex flex-col items-start justify-center gap-1 border-r-2 border-black px-2 py-2 text-left ${active ? 'bg-yellow-400 hover:bg-yellow-300' : ''}`}
      >
        <span className="bb-guide-channel-number">{padChannel(channel.number)}</span>
        <span className="bb-guide-channel-callsign">{channel.callsign}</span>
        <span className="bb-guide-channel-name">{channel.name}</span>
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
              data-on-now={onNow ? 'true' : 'false'}
              onClick={() => onTune(channel.id)}
              tabIndex={dup ? -1 : undefined}
              className={`bb-guide-program-cell absolute top-0 h-full overflow-hidden border-r-2 border-black px-2 py-1.5 text-left ${onNow ? 'bg-[#173d91] border-l-2 border-l-amber-300' : ''}`}
              style={{ left: `${((left - windowStart) / span) * 100}%`, width: `${((right - left) / span) * 100}%` }}
            >
              <p className="line-clamp-2 font-heading text-[11px] font-bold uppercase leading-tight text-white sm:text-xs">
                {slot.startMs < windowStart && <span className="text-prevue-yellow">◄ </span>}
                {slot.program.title}
                {slot.endMs > windowStart + span && <span className="text-prevue-yellow"> ►</span>}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-yellow-300">{clock(slot.startMs)}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
