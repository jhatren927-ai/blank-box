import { useEffect, useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import type { Channel, Program, SearchHit, SourceId } from '../types.ts'
import { Button } from './ui/button.tsx'
import { Modal } from './ui/dialog.tsx'
import { isAdultText } from '../lib/adult.ts'
import { lengthLabel, mapPool, uid } from '../lib/format.ts'
import { lookById, lookForTheme, nextLook } from '../lib/looks.ts'
import { callsignFrom, channelNameFromTheme } from '../lib/names.ts'
import { adapterFor } from '../sources/index.ts'

const IDEAS = ['Cartoons', 'Animals', 'Space', 'Music', 'Old movies', 'Science', 'Sports', 'Trains']

type Picker = 'archive' | 'youtube' | 'link' | 'vimeo' | 'dailymotion' | 'wikimedia' | 'nasa' | 'm3u'

const PICKERS: Array<{ id: Picker; label: string; more?: boolean }> = [
  { id: 'archive', label: 'Free movies' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'link', label: 'A link' },
  { id: 'nasa', label: 'NASA', more: true },
  { id: 'wikimedia', label: 'Wikimedia', more: true },
  { id: 'vimeo', label: 'Vimeo', more: true },
  { id: 'dailymotion', label: 'Dailymotion', more: true },
  { id: 'm3u', label: 'A playlist', more: true },
]

function pickerSource(picker: Picker): SourceId {
  if (picker === 'link' || picker === 'm3u') return 'file'
  return picker
}

function nextNumber(channels: Channel[], selfId?: string): number {
  const used = new Set(channels.filter((channel) => channel.id !== selfId).map((channel) => channel.number))
  let number = 2
  while (used.has(number)) number += 1
  return number
}

export function Builder({
  channels,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  channels: Channel[]
  initial: Channel | null
  onClose: () => void
  onSave: (channel: Channel) => void
  onDelete: (id: string) => void
}) {
  const [step, setStep] = useState<'theme' | 'pick'>(initial ? 'pick' : 'theme')
  const [theme, setTheme] = useState(initial?.theme ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [number, setNumber] = useState(initial?.number ?? nextNumber(channels))
  const [look, setLook] = useState(initial?.look ?? 'gold')
  const [channelId] = useState(initial?.id ?? uid())
  const [programs, setPrograms] = useState<Program[]>(initial?.programs ?? [])
  const [picker, setPicker] = useState<Picker>('archive')
  const [more, setMore] = useState(false)
  const [draftQuery, setDraftQuery] = useState(initial?.theme ?? '')
  const [query, setQuery] = useState(initial?.theme ?? '')
  const [page, setPage] = useState(1)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [status, setStatus] = useState<Record<string, 'busy' | 'added' | 'failed'>>({})
  const [archiveAll, setArchiveAll] = useState(false)
  const [hideAdult, setHideAdult] = useState(true)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const searchable = adapterFor(pickerSource(picker))?.search

  useEffect(() => {
    if (step !== 'pick' || !searchable) return
    const adapter = adapterFor(pickerSource(picker))
    if (!adapter?.search || !query.trim()) return
    let cancel = false
    setSearching(true)
    setSearchError(null)
    adapter
      .search(query.trim(), { page, archiveAll, hideAdult })
      .then((next) => {
        if (!cancel) setHits(next)
      })
      .catch((error: unknown) => {
        if (!cancel) setSearchError(error instanceof Error ? error.message : 'The search did not work.')
      })
      .finally(() => {
        if (!cancel) setSearching(false)
      })
    return () => {
      cancel = true
    }
  }, [step, searchable, picker, query, page, archiveAll, hideAdult])

  function makeIt() {
    const text = theme.trim()
    if (!text) return
    const made = channelNameFromTheme(text)
    setName(made)
    setLook(lookForTheme(text).id)
    setDraftQuery(text)
    setQuery(text)
    setPage(1)
    setStep('pick')
  }

  function addPrograms(next: Program[]) {
    setPrograms((current) => {
      const seen = new Set(current.map((program) => `${program.source}:${program.remoteId}`))
      const fresh = next.filter((program) => {
        if (hideAdult && isAdultText(program.title)) return false
        const key = `${program.source}:${program.remoteId}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      return [...current, ...fresh]
    })
  }

  async function addHit(hit: SearchHit) {
    const adapter = adapterFor(hit.source)
    if (!adapter?.fromHit) return
    setStatus((current) => ({ ...current, [hit.id]: 'busy' }))
    try {
      const many = adapter.fromHitMany ? await adapter.fromHitMany(hit) : null
      const program = many ? null : await adapter.fromHit!(hit)
      const resolved = many ?? (program ? [program] : [])
      const safe = resolved.filter((item) => !hideAdult || !isAdultText(item.title))
      if (safe.length === 0) {
        setStatus((current) => ({ ...current, [hit.id]: 'failed' }))
        return
      }
      addPrograms(safe)
      setStatus((current) => ({ ...current, [hit.id]: 'added' }))
    } catch {
      setStatus((current) => ({ ...current, [hit.id]: 'failed' }))
    }
  }

  async function addThese() {
    setBusy(true)
    setNote(null)
    const fresh = hits.filter((hit) => status[hit.id] !== 'added')
    const resolved = await mapPool(fresh, 3, async (hit) => {
      const adapter = adapterFor(hit.source)
      if (!adapter?.fromHit && !adapter?.fromHitMany) return []
      setStatus((current) => ({ ...current, [hit.id]: 'busy' }))
      try {
        const many = adapter.fromHitMany ? await adapter.fromHitMany(hit) : null
        const program = many ? null : await adapter.fromHit!(hit)
        const resolved = many ?? (program ? [program] : [])
        const safe = resolved.filter((item) => !hideAdult || !isAdultText(item.title))
        setStatus((current) => ({ ...current, [hit.id]: safe.length ? 'added' : 'failed' }))
        return safe
      } catch {
        setStatus((current) => ({ ...current, [hit.id]: 'failed' }))
        return []
      }
    })
    const programsFound = resolved.flat()
    addPrograms(programsFound)
    const missed = fresh.length - resolved.filter((items) => items.length > 0).length
    if (missed > 0) setNote(`${missed} ${missed === 1 ? 'video' : 'videos'} would not play, so they were skipped.`)
    setBusy(false)
  }

  async function addPaste() {
    const adapter = adapterFor(pickerSource(picker))
    if (!adapter?.fromPaste) return
    setBusy(true)
    setNote(null)
    try {
      const next = await adapter.fromPaste(paste)
      addPrograms(next)
      setPaste('')
      if (next.length > 1) setNote(`Added ${next.length} videos.`)
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  function watch() {
    if (!name.trim()) return
    const used = new Set(channels.filter((channel) => channel.id !== channelId).map((channel) => channel.number))
    let chosen = Math.max(1, Math.round(number) || 2)
    while (used.has(chosen)) chosen += 1
    onSave({
      id: channelId,
      number: chosen,
      name: name.trim(),
      callsign: callsignFrom(name),
      theme: theme.trim() || initial?.theme || name.trim(),
      look,
      programs,
    })
  }

  const callsign = callsignFrom(name || 'TV')
  const bug = lookById(look).bug

  return (
    <section data-testid="builder" className="bb-builder mx-auto max-w-3xl px-3 py-4">
      <button type="button" className="font-mono text-sm text-slate-400 hover:text-yellow-300" onClick={() => (programs.length > 0 && !initial ? setLeaveOpen(true) : onClose())}>
        ← Back to TV
      </button>
      {step === 'theme' ? (
        <div className="mt-4 rounded-md border border-[#1e293b] bg-[#101624] p-4 sm:p-6">
          <h2 className="font-heading text-3xl font-black uppercase text-white">What should this channel play?</h2>
          <p className="mt-2 font-mono text-sm text-slate-400">Type something like cartoons, space, or music.</p>
          <input
            data-testid="theme-input"
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') makeIt()
            }}
            placeholder="horror movies"
            className="mt-4 h-16 w-full rounded-sm border border-[#263149] bg-black/40 px-4 font-heading text-2xl text-white outline-none focus:border-yellow-400"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setTheme(idea)}
                className="h-11 rounded-full border border-[#263149] px-4 font-mono text-sm text-slate-200 hover:border-yellow-400"
              >
                {idea}
              </button>
            ))}
          </div>
          <Button data-testid="make-channel" className="mt-5 w-full" size="lg" disabled={!theme.trim()} onClick={makeIt}>
            Make it
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-md border border-[#1e293b] bg-[#101624] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-sm border-2 px-2 py-1 ${bug}`}>
                <span className="block font-heading text-xl font-black italic leading-none">{callsign}</span>
                <span className="font-mono text-[10px] tracking-widest">{String(number).padStart(2, '0')}</span>
              </span>
              <div className="min-w-0 flex-1">
                <label className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Channel name</label>
                <input
                  data-testid="channel-name"
                  value={name}
                  onChange={(event) => setName(event.target.value.slice(0, 32))}
                  className="h-12 w-full bg-transparent font-heading text-2xl font-black uppercase text-white outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="h-12 w-12 rounded-sm bg-[#1b2333] text-xl" onClick={() => setNumber((value) => Math.max(1, value - 1))} aria-label="Lower channel number">
                  −
                </button>
                <span className="w-12 text-center font-mono text-2xl font-bold text-yellow-300">{number}</span>
                <button type="button" className="h-12 w-12 rounded-sm bg-[#1b2333] text-xl" onClick={() => setNumber((value) => value + 1)} aria-label="Higher channel number">
                  +
                </button>
              </div>
            </div>
            <Button variant="navy" size="sm" className="mt-3" onClick={() => setLook(nextLook(look).id)}>
              New colors
            </Button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {PICKERS.filter((item) => !item.more || more).map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`source-${item.id === 'link' ? 'link' : item.id}`}
                onClick={() => {
                  setPicker(item.id)
                  setHits([])
                  setPage(1)
                  setNote(null)
                  if (item.id === 'archive' || item.id === 'nasa' || item.id === 'wikimedia' || item.id === 'dailymotion') {
                    setQuery(draftQuery || theme)
                  }
                }}
                className={`h-12 shrink-0 rounded-full px-4 font-mono text-sm font-bold ${picker === item.id ? 'bg-yellow-400 text-black' : 'border border-[#263149] text-slate-200'}`}
              >
                {item.label}
              </button>
            ))}
            <button type="button" className="h-12 shrink-0 rounded-full border border-[#263149] px-4 font-mono text-sm text-slate-300" onClick={() => setMore((value) => !value)}>
              {more ? 'Less' : 'More places'}
            </button>
          </div>

          {searchable && (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                setPage(1)
                setQuery(draftQuery)
              }}
            >
              <input
                data-testid="search-input"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                className="h-14 min-w-0 flex-1 rounded-sm border border-[#263149] bg-black/40 px-3 font-mono text-lg text-white outline-none focus:border-yellow-400"
              />
              <Button type="submit" className="h-14 px-5">
                Search
              </Button>
            </form>
          )}

          {(picker === 'youtube' || picker === 'link' || picker === 'vimeo' || picker === 'm3u' || picker === 'dailymotion') && (
            <div className="space-y-2">
              {picker === 'm3u' ? (
                <textarea
                  data-testid="paste-input"
                  value={paste}
                  onChange={(event) => setPaste(event.target.value)}
                  placeholder={'Paste a playlist. It looks like:\n#EXTM3U\n#EXTINF:-1,My Show\nhttps://example.com/video.m3u8'}
                  className="h-36 w-full rounded-sm border border-[#263149] bg-black/40 p-3 font-mono text-sm text-white outline-none focus:border-yellow-400"
                />
              ) : (
                <input
                  data-testid="paste-input"
                  value={paste}
                  onChange={(event) => setPaste(event.target.value)}
                  placeholder={
                    picker === 'youtube'
                      ? 'Paste a YouTube video or playlist link'
                      : picker === 'vimeo'
                        ? 'Paste a Vimeo link'
                        : picker === 'dailymotion'
                          ? 'Or paste a Dailymotion link'
                          : 'Paste an mp4, webm, m3u8, or mpd link'
                  }
                  className="h-14 w-full rounded-sm border border-[#263149] bg-black/40 px-3 font-mono text-base text-white outline-none focus:border-yellow-400"
                />
              )}
              <Button data-testid="paste-add" className="w-full" disabled={busy || !paste.trim()} onClick={() => void addPaste()}>
                {busy ? 'Adding…' : 'Add it'}
              </Button>
              {picker === 'youtube' && (
                <p className="font-mono text-xs text-slate-400">YouTube plays in YouTube’s player, ads included. A playlist stays together and automatically advances through its videos.</p>
              )}
            </div>
          )}

          <details className="rounded-sm border border-[#263149] px-3 py-2">
            <summary className="cursor-pointer font-mono text-sm text-slate-300">Search options</summary>
            <label className="mt-3 flex items-center gap-3 font-mono text-sm text-slate-200">
              <input type="checkbox" checked={hideAdult} onChange={(event) => setHideAdult(event.target.checked)} />
              Skip grown-up videos
            </label>
            <label className="mt-2 flex items-center gap-3 font-mono text-sm text-slate-200">
              <input type="checkbox" checked={archiveAll} onChange={(event) => setArchiveAll(event.target.checked)} />
              Search all Archive.org video collections
            </label>
          </details>

          {searching && <p className="font-mono text-lg text-yellow-300">Looking for videos…</p>}
          {searchError && <p className="rounded-sm bg-red-950 px-3 py-2 font-mono text-sm text-red-200">{searchError}</p>}
          {note && <p className="rounded-sm bg-[#001144] px-3 py-2 font-mono text-sm text-blue-100">{note}</p>}

          {searchable && hits.length > 0 && (
            <div className="space-y-2">
              <Button data-testid="add-these" variant="navy" className="w-full" disabled={busy} onClick={() => void addThese()}>
                Add these
              </Button>
              {hits.map((hit) => (
                <div key={hit.id} data-testid="search-hit" className="flex items-center gap-3 rounded-sm bg-[#121827] p-2">
                  {hit.thumb ? (
                    <img src={hit.thumb} alt="" className="h-16 w-28 shrink-0 rounded-sm object-cover" />
                  ) : (
                    <div className="h-16 w-28 shrink-0 rounded-sm bg-black" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-heading text-sm font-bold uppercase text-white">{hit.title}</p>
                    <p className="truncate font-mono text-[11px] text-slate-400">
                      {hit.year ? `${hit.year} · ` : ''}
                      {hit.durationSec ? lengthLabel(hit.durationSec) : hit.blurb}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="hit-add"
                    data-status={status[hit.id] ?? 'idle'}
                    disabled={status[hit.id] === 'busy' || status[hit.id] === 'added'}
                    onClick={() => void addHit(hit)}
                    className="h-14 min-w-24 rounded-sm bg-yellow-400 px-3 font-mono text-sm font-bold text-black disabled:opacity-60"
                  >
                    {status[hit.id] === 'busy' ? '…' : status[hit.id] === 'added' ? 'Added' : status[hit.id] === 'failed' ? 'No' : 'Add'}
                  </button>
                </div>
              ))}
              <Button
                variant="chassis"
                className="w-full"
                onClick={() => setPage((value) => value + 1)}
              >
                More videos
              </Button>
            </div>
          )}
          {searchable && !searching && query && hits.length === 0 && !searchError && (
            <p className="font-mono text-sm text-slate-400">Nothing matched. Try a different word.</p>
          )}

          <div className="rounded-md border border-[#1e293b] bg-black/30 p-3">
            <p data-testid="picked-count" className="font-mono text-lg text-yellow-300">
              {programs.length} picked
            </p>
            <p className="font-mono text-xs text-slate-400">About 60 fills a whole day. One is enough to start watching.</p>
            <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
              {programs.map((program) => (
                <li key={program.id} className="flex items-center gap-2">
                  <span data-testid="picked-title" className="min-w-0 flex-1 truncate font-mono text-sm text-white">
                    {program.title}
                  </span>
                  {program.youtubePlaylistId ? (
                    <span className="w-16 text-center font-mono text-[10px] text-yellow-300">PLAYLIST</span>
                  ) : (
                    <>
                      <button type="button" aria-label="Shorter" className="h-10 w-10 rounded-sm bg-[#1b2333]" onClick={() => setPrograms((current) => current.map((item) => item.id === program.id ? { ...item, durationSec: Math.max(60, item.durationSec - 300), durationGuess: true } : item))}>
                        <Minus className="mx-auto size-4" />
                      </button>
                      <span className="w-16 text-center font-mono text-[11px] text-slate-300">
                        {program.durationGuess ? '~' : ''}
                        {lengthLabel(program.durationSec)}
                      </span>
                      <button type="button" aria-label="Longer" className="h-10 w-10 rounded-sm bg-[#1b2333]" onClick={() => setPrograms((current) => current.map((item) => item.id === program.id ? { ...item, durationSec: item.durationSec + 300, durationGuess: true } : item))}>
                        <Plus className="mx-auto size-4" />
                      </button>
                    </>
                  )}
                  <button type="button" aria-label="Remove" className="h-10 w-10 rounded-sm bg-[#1b2333] text-red-300" onClick={() => setPrograms((current) => current.filter((item) => item.id !== program.id))}>
                    <Trash2 className="mx-auto size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="bb-builder-save-row">
            <p>{programs.length === 0
              ? 'Save this station now. You can add shows to it later.'
              : `${programs.length} shows ready for this station.`}</p>
            <Button data-testid="watch-channel" size="lg" className="w-full" disabled={!name.trim()} onClick={watch}>
              {programs.length === 0 ? 'Save channel' : 'Save & watch'}
            </Button>
          </div>
          {initial && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                if (window.confirm(`Throw away ${initial.name}?`)) onDelete(initial.id)
              }}
            >
              Throw away this channel
            </Button>
          )}
        </div>
      )}
      <Modal open={leaveOpen} onOpenChange={setLeaveOpen} title="Save this channel?">
        <div className="flex flex-col gap-3">
          <Button onClick={watch} disabled={programs.length === 0}>Watch</Button>
          <Button variant="danger" onClick={onClose}>Throw it away</Button>
        </div>
      </Modal>
    </section>
  )
}
