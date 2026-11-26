import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Ban, Hammer, HeartPulse, ListStart, Loader2, Plus, Search, Shield, Shuffle, Trash2 } from 'lucide-react'
import type { Automation, AutomationAction, AutomationWhen, Channel, ChannelRule, Program, SearchHit, SourceId } from '../types.ts'
import { useStore } from '../state.tsx'
import { Button } from './ui/button.tsx'
import { Settings } from './Settings.tsx'
import { clock, lengthLabel, padChannel, uid } from '../lib/format.ts'
import { callsignFrom, channelNameFromTheme } from '../lib/names.ts'
import { lookById, lookForTheme, nextLook } from '../lib/looks.ts'
import { slotsCovering } from '../lib/schedule.ts'
import { blankRule, cleanupChannel, judge, SOURCE_CHOICES, tally, tapeKey } from '../lib/rules.ts'
import {
  findDuplicates,
  fixDuplicates,
  mergeChannels,
  moveProgram,
  onAir,
  playNext,
  reorder,
  restorePrograms,
  retirePrograms,
  retireWholeTape,
  shufflePrograms,
} from '../lib/lineup.ts'
import { checkDeadLinks, runAutomation } from '../lib/automations.ts'
import { programsFromLines } from '../lib/paste.ts'
import { adapterFor, adapters } from '../sources/index.ts'

const field =
  'h-10 w-full rounded-sm border border-[#263149] bg-black/50 px-2 font-mono text-xs text-slate-100 outline-none focus:border-yellow-400'

function nextNumber(channels: Channel[]): number {
  const used = new Set(channels.map((channel) => channel.number))
  let number = 2
  while (used.has(number)) number += 1
  return number
}

function stub(hit: SearchHit): Program {
  return {
    id: 'stub',
    remoteId: hit.id,
    source: hit.source,
    title: hit.title,
    durationSec: hit.durationSec && hit.durationSec >= 15 ? hit.durationSec : 10 * 60,
    durationGuess: !hit.durationSec,
    year: hit.year,
  }
}

export function MasterControl({ now, onWatch }: { now: number; onWatch: (id: string) => void }) {
  const store = useStore()
  const { network } = store
  const airing = network.channels.filter((channel) => !channel.signedOff)
  const signedOff = network.channels.filter((channel) => channel.signedOff)
  const [picked, setPicked] = useState(airing[0]?.id ?? '')
  const channel = network.channels.find((item) => item.id === picked) ?? airing[0]
  const [newName, setNewName] = useState('')
  const [name, setName] = useState(channel?.name ?? '')
  const [number, setNumber] = useState(String(channel?.number ?? 2))
  const [callsign, setCallsign] = useState(channel?.callsign ?? '')
  const [tagline, setTagline] = useState(channel?.tagline ?? '')
  const [source, setSource] = useState<SourceId>('archive')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [bulk, setBulk] = useState('')
  const [note, setNote] = useState('')
  const [filter, setFilter] = useState('')
  const [moveTo, setMoveTo] = useState<Record<string, string>>({})
  const [mergeInto, setMergeInto] = useState('')
  const [rule, setRule] = useState<ChannelRule>(() => blankRule('network'))
  const [blockDraft, setBlockDraft] = useState('')
  const [junkDraft, setJunkDraft] = useState('')
  const [automation, setAutomation] = useState<Automation | null>(null)
  const channelId = channel?.id

  useEffect(() => {
    if (!channel) return
    setName(channel.name)
    setNumber(String(channel.number))
    setCallsign(channel.callsign)
    setTagline(channel.tagline ?? '')
  }, [channelId])

  function createChannel() {
    const title = newName.trim()
    if (title.length < 2) return
    const made: Channel = {
      id: uid(),
      number: nextNumber(network.channels),
      name: channelNameFromTheme(title),
      callsign: callsignFrom(title),
      theme: title,
      look: lookForTheme(title).id,
      tagline: '',
      programs: [],
    }
    store.saveChannel(made)
    setPicked(made.id)
    setNewName('')
    setQuery(title)
    setNote(`${made.name} is on the air. Add some tapes.`)
  }

  function saveChannelEdit() {
    if (!channel) return
    const wanted = Math.max(1, Number(number) || channel.number)
    const taken = network.channels.some((item) => item.id !== channel.id && item.number === wanted && !item.signedOff)
    store.update((current) => ({
      ...current,
      channels: current.channels.map((item) =>
        item.id === channel.id
          ? {
              ...item,
              name: name.trim() || item.name,
              callsign: (callsign.trim() || callsignFrom(name)).toUpperCase().slice(0, 6),
              tagline,
              number: taken ? item.number : wanted,
              theme: item.theme || name,
            }
          : item,
      ),
    }))
    setNote(taken ? `Channel ${wanted} is taken, so the number stayed.` : 'Channel saved.')
  }

  function patchChannel(recipe: (item: Channel) => Channel) {
    if (!channel) return
    const id = channel.id
    store.update((current) => ({
      ...current,
      channels: current.channels.map((item) => (item.id === id ? recipe(item) : item)),
    }))
  }

  function accept(incoming: Program[]) {
    if (!channel) return
    const accepted: Program[] = []
    const skipped: string[] = []
    let count = onAir(channel).length
    const have = new Set(channel.programs.map(tapeKey))
    for (const program of incoming) {
      if (have.has(tapeKey(program))) {
        skipped.push(`${program.title} is already here`)
        continue
      }
      const verdict = judge(program, channel, network, count)
      if (!verdict.pass) {
        skipped.push(`${program.title}: ${verdict.reasons[0]}`)
        continue
      }
      accepted.push(program)
      have.add(tapeKey(program))
      count += 1
    }
    if (skipped.length) setNote(skipped.slice(0, 3).join(' · '))
    else if (accepted.length) setNote(`Added ${accepted.length}.`)
    if (accepted.length) patchChannel((item) => ({ ...item, programs: [...item.programs, ...accepted] }))
  }

  async function runSearch() {
    const adapter = adapterFor(source)
    if (!adapter?.search) {
      setNote('That place has no search. Paste links instead.')
      return
    }
    setSearching(true)
    setNote('')
    try {
      setHits(await adapter.search(query || channel?.theme || channel?.name || '', { page: 1, archiveAll: false, hideAdult: true }))
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Search did not work.')
    } finally {
      setSearching(false)
    }
  }

  async function addHit(hit: SearchHit) {
    const adapter = adapterFor(hit.source)
    if (!adapter?.fromHit) return
    setBusy(true)
    try {
      const program = await adapter.fromHit(hit)
      if (program) accept([program])
      else setNote('That one will not play.')
    } finally {
      setBusy(false)
    }
  }

  async function addBulk() {
    setBusy(true)
    try {
      const programs = await programsFromLines(bulk)
      if (programs.length === 0) setNote('None of those links opened.')
      else {
        accept(programs)
        setBulk('')
      }
    } finally {
      setBusy(false)
    }
  }

  const counts = channel ? tally(channel, network) : { pass: 0, fail: 0 }
  const duplicates = findDuplicates(network)
  const preview = channel ? slotsCovering(channel, now, now + 3 * 60 * 60 * 1000).slice(0, 8) : []
  const needle = filter.trim().toLowerCase()
  const visible = (channel?.programs ?? []).filter((program) => {
    if (program.retired) return false
    if (!needle) return true
    return `${program.title} ${program.remoteId}`.toLowerCase().includes(needle)
  })
  const pulled = (channel?.programs ?? []).filter((program) => program.retired)

  return (
    <main data-testid="master-control" className="mx-auto max-w-[1500px] px-4 py-6">
      <span className="inline-block bg-red-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-white">
        Broadcast Master Control
      </span>
      <h1 className="mt-2 font-heading text-3xl font-black uppercase tracking-tight text-white">Program the Network</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Add tapes, pull the ones you do not want, and set rules. The guide follows the clock on this device. Nothing is sent to a server.
      </p>

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          createChannel()
        }}
      >
        <input data-testid="mc-new-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New channel, like cartoons" className={`${field} max-w-sm`} />
        <Button data-testid="mc-create-channel" type="submit" disabled={newName.trim().length < 2}>
          <Plus className="size-4" /> New channel
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        {airing.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-testid={`mc-tab-${item.id}`}
            onClick={() => setPicked(item.id)}
            className={`bevel rounded-sm px-3 py-2 font-heading text-xs font-extrabold uppercase tracking-wider ${item.id === channel?.id ? 'bg-yellow-400 text-black' : 'bg-[#1b2333] text-slate-200'}`}
          >
            CH {padChannel(item.number)} · {item.callsign}
            <span className="ml-2 font-mono text-[10px] opacity-70">{onAir(item).length}</span>
          </button>
        ))}
      </div>

      {signedOff.length > 0 && (
        <div data-testid="signed-off-list" className="mt-3 rounded-md border border-dashed border-[#334155] p-3">
          <p className="font-mono text-[10px] font-bold tracking-widest text-slate-400">SIGNED-OFF CHANNELS</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {signedOff.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`mc-restore-channel-${item.id}`}
                className="rounded-sm bg-[#111a36] px-3 py-1 font-mono text-xs text-slate-200"
                onClick={() => {
                  store.update((current) => ({
                    ...current,
                    channels: current.channels.map((channelItem) =>
                      channelItem.id === item.id ? { ...channelItem, signedOff: false } : channelItem,
                    ),
                  }))
                  setPicked(item.id)
                }}
              >
                Restore {item.callsign}
              </button>
            ))}
          </div>
        </div>
      )}

      {!channel && <p className="mt-8 font-mono text-slate-400">Make a channel to start.</p>}

      {channel && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="min-w-0 lg:col-span-7">
            <div className="rounded-md border border-[#1e293b] bg-[#0d152f]">
              <div className="flex flex-wrap items-center gap-3 border-b border-[#1e293b] px-4 py-3">
                <span className={`rounded-sm border px-2 py-0.5 font-heading text-xs font-extrabold ${lookById(channel.look).bug}`}>{channel.callsign}</span>
                <p data-testid="mc-tape-count" className="font-mono text-xs text-slate-400">
                  {onAir(channel).length} tapes on the air
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-red-300"
                  data-testid="mc-sign-off"
                  onClick={() => {
                    const id = channel.id
                    patchChannel((item) => ({ ...item, signedOff: true }))
                    const other = airing.find((item) => item.id !== id)
                    setPicked(other?.id ?? '')
                  }}
                >
                  <Trash2 className="size-4" /> Sign off
                </Button>
              </div>
              <div className="grid gap-2 border-b border-[#1e293b] p-3 sm:grid-cols-2">
                <input data-testid="mc-edit-name" className={field} value={name} onChange={(event) => setName(event.target.value)} aria-label="Channel name" />
                <input data-testid="mc-edit-call" className={field} value={callsign} onChange={(event) => setCallsign(event.target.value.toUpperCase())} aria-label="Callsign" />
                <input data-testid="mc-edit-number" className={field} value={number} onChange={(event) => setNumber(event.target.value)} aria-label="Channel number" />
                <input data-testid="mc-edit-tagline" className={field} value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder="Tagline" aria-label="Tagline" />
                <Button data-testid="mc-save-channel" size="sm" onClick={saveChannelEdit}>Save channel</Button>
                <Button size="sm" variant="navy" data-testid="mc-new-colors" onClick={() => patchChannel((item) => ({ ...item, look: nextLook(item.look).id }))}>
                  New colors
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 border-b border-[#1e293b] px-3 py-2">
                <input data-testid="mc-filter" className={field} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find a tape" />
                <Button size="sm" variant="chassis" data-testid="mc-shuffle" onClick={() => patchChannel(shufflePrograms)}>
                  <Shuffle className="size-4" /> Shuffle
                </Button>
                <Button size="sm" variant="navy" onClick={() => onWatch(channel.id)}>Watch</Button>
              </div>
              <ul data-testid="mc-tapes" className="max-h-[640px] divide-y divide-[#1e293b] overflow-y-auto">
                {visible.length === 0 && <li className="px-4 py-6 font-mono text-xs text-slate-500">No tapes yet. Search on the right and tap Add.</li>}
                {visible.map((program, index) => {
                  const parts = channel.programs.filter((item) => item.remoteId && item.remoteId === program.remoteId).length
                  const verdict = judge(program, channel, network)
                  return (
                    <li key={program.id} data-testid="mc-tape" className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <span className="w-6 font-mono text-xs text-slate-500">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{program.title}</p>
                        <p className="font-mono text-[10px] text-yellow-300">
                          {program.durationGuess ? '~' : ''}
                          {lengthLabel(program.durationSec)} · {program.source}
                          {program.keep ? ' · KEEP' : ''}
                          {!verdict.pass ? ` · ${verdict.reasons[0]}` : ''}
                        </p>
                      </div>
                      <button type="button" aria-label="Earlier" className="h-9 w-9 rounded-sm bg-[#1b2333]" onClick={() => patchChannel((item) => reorder(item, program.id, -1))}>
                        <ArrowUp className="mx-auto size-4" />
                      </button>
                      <button type="button" aria-label="Later" className="h-9 w-9 rounded-sm bg-[#1b2333]" onClick={() => patchChannel((item) => reorder(item, program.id, 1))}>
                        <ArrowDown className="mx-auto size-4" />
                      </button>
                      <button type="button" aria-label="Play next" className="h-9 w-9 rounded-sm bg-[#1b2333]" onClick={() => patchChannel((item) => playNext(item, program.id, now))}>
                        <ListStart className="mx-auto size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={program.keep ? 'Stop keeping' : 'Keep'}
                        data-testid={`mc-keep-${program.id}`}
                        className="h-9 w-9 rounded-sm bg-[#1b2333]"
                        onClick={() =>
                          patchChannel((item) => ({
                            ...item,
                            programs: item.programs.map((tape) => (tape.id === program.id ? { ...tape, keep: !tape.keep } : tape)),
                          }))
                        }
                      >
                        <Shield className={`mx-auto size-4 ${program.keep ? 'text-yellow-300' : ''}`} />
                      </button>
                      <select
                        aria-label="Move to"
                        data-testid={`mc-move-select-${program.id}`}
                        className="h-9 max-w-28 rounded-sm bg-[#1b2333] px-1 font-mono text-[10px]"
                        value={moveTo[program.id] ?? ''}
                        onChange={(event) => setMoveTo((current) => ({ ...current, [program.id]: event.target.value }))}
                      >
                        <option value="">Move…</option>
                        {airing
                          .filter((item) => item.id !== channel.id)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {padChannel(item.number)} {item.callsign}
                            </option>
                          ))}
                      </select>
                      <Button
                        size="sm"
                        variant="chassis"
                        data-testid={`mc-move-${program.id}`}
                        disabled={!moveTo[program.id]}
                        onClick={() => store.update((current) => moveProgram(current, program.id, moveTo[program.id]))}
                      >
                        Move
                      </Button>
                      <Button size="sm" variant="danger" data-testid={`mc-retire-${program.id}`} onClick={() => patchChannel((item) => retirePrograms(item, [program.id], 'pulled by you'))}>
                        Pull
                      </Button>
                      {parts > 1 && (
                        <Button size="sm" variant="ghost" className="text-red-300" data-testid={`mc-retire-tape-${program.id}`} onClick={() => patchChannel((item) => retireWholeTape(item, program))}>
                          <Ban className="size-4" /> All parts
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
              {pulled.length > 0 && (
                <div className="border-t border-[#1e293b] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-orange-300">Pulled tapes</p>
                  <ul className="mt-2 space-y-1">
                    {pulled.map((program) => (
                      <li key={program.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">{program.title}</span>
                        <Button size="sm" variant="chassis" data-testid={`mc-restore-${program.id}`} onClick={() => patchChannel((item) => restorePrograms(item, [program.id], true))}>
                          Put back
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div data-testid="mc-schedule" className="border-t border-[#1e293b] p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Schedule preview · the guide rebuilds from the clock</p>
                <ul className="mt-2 space-y-1">
                  {preview.map((slot) => (
                    <li key={`${slot.program.id}-${slot.startMs}`} className="font-mono text-[11px] text-slate-200">
                      <span className="text-yellow-300">{clock(slot.startMs)}</span> {slot.program.title}
                    </li>
                  ))}
                  {preview.length === 0 && <li className="font-mono text-[11px] text-slate-500">Nothing on the air.</li>}
                </ul>
              </div>
            </div>
          </section>

          <section className="flex min-w-0 flex-col gap-4 lg:col-span-5">
            <div data-testid="builder-panel" className="rounded-md border border-yellow-400/30 bg-[#0d152f] p-4">
              <p className="flex items-center gap-2 font-heading text-xs font-extrabold uppercase tracking-[0.25em] text-yellow-400">
                <Hammer className="size-4" /> Channel builder
              </p>
              <p className="mt-1 text-xs text-slate-400">Search, see what passes your rules, and add the tapes you want.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <select className={field} value={source} onChange={(event) => setSource(event.target.value as SourceId)} aria-label="Source">
                  {adapters
                    .filter((adapter) => adapter.search)
                    .map((adapter) => (
                      <option key={adapter.id} value={adapter.id}>
                        {adapter.label}
                      </option>
                    ))}
                </select>
                <input data-testid="mc-search-input" className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ducks, space, cartoons" />
                <Button data-testid="mc-search-go" disabled={searching} onClick={() => void runSearch()}>
                  {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Find tapes
                </Button>
              </div>
              <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                {hits.map((hit) => {
                  const verdict = judge(stub(hit), channel, network)
                  return (
                    <li key={hit.id} data-testid="mc-hit" className="flex items-center gap-2 rounded-sm border border-[#1e293b] p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white">{hit.title}</p>
                        <p className={`font-mono text-[10px] ${verdict.pass ? 'text-emerald-300' : 'text-red-300'}`}>{verdict.pass ? 'Passes' : verdict.reasons[0]}</p>
                      </div>
                      <Button size="sm" data-testid="mc-hit-add" disabled={busy || !verdict.pass} onClick={() => void addHit(hit)}>
                        Add
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="rounded-md border border-[#1e293b] bg-[#0d152f] p-4">
              <p className="font-heading text-xs font-extrabold uppercase tracking-[0.25em] text-yellow-400">Paste a pile of links</p>
              <textarea data-testid="mc-bulk" value={bulk} onChange={(event) => setBulk(event.target.value)} placeholder="One link on each line" className={`${field} mt-2 h-24`} />
              <Button className="mt-2" data-testid="mc-bulk-add" disabled={busy || !bulk.trim()} onClick={() => void addBulk()}>
                Add the ones that pass
              </Button>
            </div>

            <div data-testid="mc-rules" className="rounded-md border border-[#1e293b] bg-[#0d152f] p-4">
              <p className="font-heading text-xs font-extrabold uppercase tracking-[0.25em] text-sky-300">Rules</p>
              <p data-testid="mc-verdict" className="mt-1 font-mono text-sm text-white">
                {counts.pass} pass / {counts.fail} fail
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select className={field} value={rule.scope} onChange={(event) => setRule({ ...rule, scope: event.target.value })} aria-label="Rule scope">
                  <option value="network">Whole network</option>
                  <option value={channel.id}>This channel</option>
                </select>
                <input className={field} value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} aria-label="Rule name" />
                <input className={field} placeholder="Min minutes" value={rule.minMinutes ?? ''} onChange={(event) => setRule({ ...rule, minMinutes: event.target.value ? Number(event.target.value) : null })} />
                <input className={field} placeholder="Max minutes" value={rule.maxMinutes ?? ''} onChange={(event) => setRule({ ...rule, maxMinutes: event.target.value ? Number(event.target.value) : null })} />
                <input className={field} placeholder="Year from" value={rule.yearFrom ?? ''} onChange={(event) => setRule({ ...rule, yearFrom: event.target.value ? Number(event.target.value) : null })} />
                <input className={field} placeholder="Year to" value={rule.yearTo ?? ''} onChange={(event) => setRule({ ...rule, yearTo: event.target.value ? Number(event.target.value) : null })} />
                <input data-testid="mc-rule-include" className={field} placeholder="Title must include" value={rule.mustInclude} onChange={(event) => setRule({ ...rule, mustInclude: event.target.value })} />
                <input className={field} placeholder="Title must not include" value={rule.mustExclude} onChange={(event) => setRule({ ...rule, mustExclude: event.target.value })} />
                <input className={field} placeholder="Max tapes" value={rule.maxTapes ?? ''} onChange={(event) => setRule({ ...rule, maxTapes: event.target.value ? Number(event.target.value) : null })} />
                <input className={field} placeholder="Language, like en" value={rule.language} onChange={(event) => setRule({ ...rule, language: event.target.value })} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] text-slate-300">
                {SOURCE_CHOICES.map((id) => (
                  <label key={id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={rule.sources.includes(id)}
                      onChange={() =>
                        setRule({
                          ...rule,
                          sources: rule.sources.includes(id) ? rule.sources.filter((item) => item !== id) : [...rule.sources, id],
                        })
                      }
                    />
                    {id}
                  </label>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 font-mono text-xs text-slate-200">
                <input type="checkbox" checked={rule.blockDuplicates} onChange={(event) => setRule({ ...rule, blockDuplicates: event.target.checked })} />
                No copies on other channels
              </label>
              <label className="mt-1 flex items-center gap-2 font-mono text-xs text-slate-200">
                <input type="checkbox" checked={rule.hideAdult} onChange={(event) => setRule({ ...rule, hideAdult: event.target.checked })} />
                Skip grown-up titles
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  data-testid="mc-rule-save"
                  size="sm"
                  onClick={() => {
                    store.update((current) => ({
                      ...current,
                      rules: [...(current.rules ?? []).filter((item) => item.id !== rule.id), rule],
                    }))
                    setNote('Rule saved. New tapes have to pass it.')
                  }}
                >
                  Save rule
                </Button>
                <Button
                  data-testid="mc-cleanup"
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    const result = cleanupChannel(channel, network)
                    store.update((current) => ({
                      ...current,
                      lastCleanup: result.pulled,
                      channels: current.channels.map((item) => (item.id === channel.id ? result.channel : item)),
                    }))
                    setNote(result.pulled.length ? `Pulled ${result.pulled.length}. You can put them back.` : 'Everything already passes.')
                  }}
                >
                  Clean up now
                </Button>
                {(network.lastCleanup ?? []).length > 0 && (
                  <Button
                    data-testid="mc-undo"
                    size="sm"
                    variant="navy"
                    onClick={() => {
                      const ids = network.lastCleanup ?? []
                      store.update((current) => ({
                        ...current,
                        lastCleanup: [],
                        channels: current.channels.map((item) => (item.id === channel.id ? restorePrograms(item, ids, false) : item)),
                      }))
                    }}
                  >
                    Put the last cleanup back
                  </Button>
                )}
              </div>
              <ul className="mt-3 space-y-1">
                {(network.rules ?? []).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 font-mono text-[11px] text-slate-300">
                    <span>
                      {item.enabled ? 'ON' : 'OFF'} · {item.name}
                    </span>
                    <button
                      type="button"
                      data-testid={`mc-rule-toggle-${item.id}`}
                      className="text-yellow-300"
                      onClick={() =>
                        store.update((current) => ({
                          ...current,
                          rules: (current.rules ?? []).map((ruleItem) =>
                            ruleItem.id === item.id ? { ...ruleItem, enabled: !ruleItem.enabled } : ruleItem,
                          ),
                        }))
                      }
                    >
                      {item.enabled ? 'Turn off' : 'Turn on'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <WordList title="Blocked words" words={network.blockedWords ?? []} testPrefix="mc-block" draft={blockDraft} setDraft={setBlockDraft} onSave={(words) => store.update((current) => ({ ...current, blockedWords: words }))} />
            <WordList title="Junk list" words={network.junkWords ?? []} testPrefix="mc-junk" draft={junkDraft} setDraft={setJunkDraft} onSave={(words) => store.update((current) => ({ ...current, junkWords: words }))} />

            <AutomationDesk
              channel={channel}
              automation={automation}
              setAutomation={setAutomation}
              networkAutos={network.automations ?? []}
              log={network.automationLog ?? []}
              busy={busy}
              setBusy={setBusy}
              onNote={setNote}
            />

            <div className="rounded-md border border-[#1e293b] bg-[#0d152f] p-4">
              <p className="font-heading text-xs font-extrabold uppercase tracking-[0.25em] text-orange-300">Duplicate tapes</p>
              {duplicates.length === 0 && <p data-testid="mc-dup-empty" className="mt-2 font-mono text-[11px] text-slate-500">No tape is on two channels.</p>}
              {duplicates.length > 0 && (
                <Button
                  data-testid="mc-dup-fix"
                  className="mt-2"
                  size="sm"
                  onClick={() => {
                    const result = fixDuplicates(network)
                    store.update(() => result.network)
                    setNote(`Pulled ${result.pulled} extra copies.`)
                  }}
                >
                  Keep one of each
                </Button>
              )}
              <ul className="mt-2 space-y-1">
                {duplicates.map((group) => (
                  <li key={group.key} className="font-mono text-[11px] text-slate-300">
                    {group.title} · {group.copies.map((copy) => copy.channelName).join(', ')}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border border-[#1e293b] bg-[#0d152f] p-4">
              <p className="font-heading text-xs font-extrabold uppercase tracking-[0.25em] text-yellow-300">Merge channels</p>
              <div className="mt-2 flex gap-2">
                <select data-testid="mc-merge-into" className={field} value={mergeInto} onChange={(event) => setMergeInto(event.target.value)} aria-label="Merge into">
                  <option value="">Into…</option>
                  {airing
                    .filter((item) => item.id !== channel.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
                <Button
                  data-testid="mc-merge"
                  disabled={!mergeInto}
                  onClick={() => {
                    store.update((current) => mergeChannels(current, channel.id, mergeInto))
                    setPicked(mergeInto)
                    setNote('Merged. The empty channel is signed off.')
                  }}
                >
                  Merge
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-[#1e293b] bg-[#0d152f] p-4">
              <p className="flex items-center gap-2 font-heading text-xs font-extrabold uppercase tracking-[0.25em] text-sky-300">
                <HeartPulse className="size-4" /> Library check
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {counts.fail} tapes fail the rules. {duplicates.length} duplicates.
              </p>
              <Button
                className="mt-2"
                size="sm"
                data-testid="mc-dead-check"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void checkDeadLinks(network)
                    .then((result) => {
                      store.update(() => result.network)
                      setNote(result.pulled ? `Pulled ${result.pulled} broken links.` : 'Every link still opens.')
                      setBusy(false)
                    })
                    .catch(() => setBusy(false))
                }}
              >
                Check for broken links
              </Button>
            </div>

            {(network.reports ?? []).some((report) => report.status === 'open') && (
              <div className="rounded-md border border-[#1e293b] bg-[#0d152f] p-4">
                <p className="font-heading text-xs font-extrabold uppercase tracking-[0.25em] text-amber-300">Wrong channel?</p>
                <ul className="mt-2 space-y-2">
                  {(network.reports ?? [])
                    .filter((report) => report.status === 'open')
                    .map((report) => (
                      <li key={report.id} className="font-mono text-[11px] text-slate-200">
                        {report.title}
                        <div className="mt-1 flex gap-2">
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              store.update((current) => ({
                                ...current,
                                reports: (current.reports ?? []).map((item) => (item.id === report.id ? { ...item, status: 'fixed' } : item)),
                                channels: current.channels.map((item) =>
                                  item.id === report.channelId ? retirePrograms(item, [report.programId], 'wrong channel') : item,
                                ),
                              }))
                            }
                          >
                            Pull
                          </Button>
                          <Button
                            size="sm"
                            variant="chassis"
                            onClick={() =>
                              store.update((current) => ({
                                ...current,
                                reports: (current.reports ?? []).map((item) => (item.id === report.id ? { ...item, status: 'fixed' } : item)),
                              }))
                            }
                          >
                            Fixed
                          </Button>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            <div className="rounded-md border border-[#1e293b] bg-[#0d152f] p-4">
              <p className="font-heading text-xs font-extrabold uppercase tracking-[0.25em] text-slate-300">Network</p>
              <label className="mt-2 block font-mono text-[10px] text-slate-400">Logo text</label>
              <input
                data-testid="mc-logo"
                className={field}
                value={network.logoText ?? ''}
                onChange={(event) => store.update((current) => ({ ...current, logoText: event.target.value.slice(0, 16) }))}
                placeholder="LUCKY"
              />
            </div>
            <Settings
              network={network}
              onPin={store.setPin}
              onImport={(next) => {
                store.replaceNetwork(next)
              }}
              onReset={() => {
                store.reset()
                setPicked('')
              }}
            />
          </section>
        </div>
      )}
      {note && (
        <p data-testid="mc-note" className="mt-4 font-mono text-sm text-yellow-200">
          {note}
        </p>
      )}
    </main>
  )
}

function WordList({
  title,
  words,
  draft,
  setDraft,
  onSave,
  testPrefix,
}: {
  title: string
  words: string[]
  draft: string
  setDraft: (value: string) => void
  onSave: (words: string[]) => void
  testPrefix: string
}) {
  return (
    <div className="rounded-md border border-[#1e293b] bg-[#0d152f] p-4">
      <p className="font-heading text-xs font-extrabold uppercase tracking-[0.25em] text-red-300">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {words.map((word) => (
          <button key={word} type="button" className="rounded-sm bg-red-950 px-2 py-1 font-mono text-[11px] text-red-100" onClick={() => onSave(words.filter((item) => item !== word))}>
            {word} ×
          </button>
        ))}
        {words.length === 0 && <span className="font-mono text-[11px] text-slate-500">None yet.</span>}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const value = draft.trim()
          if (value && !words.some((word) => word.toLowerCase() === value.toLowerCase())) onSave([...words, value])
          setDraft('')
        }}
      >
        <input data-testid={`${testPrefix}-input`} className={field} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <Button data-testid={`${testPrefix}-add`} type="submit" size="sm" variant="danger">
          Add
        </Button>
      </form>
    </div>
  )
}

function AutomationDesk({
  channel,
  automation,
  setAutomation,
  networkAutos,
  log,
  busy,
  setBusy,
  onNote,
}: {
  channel: Channel
  automation: Automation | null
  setAutomation: (automation: Automation | null) => void
  networkAutos: Automation[]
  log: Array<{ id: string; message: string }>
  busy: boolean
  setBusy: (busy: boolean) => void
  onNote: (note: string) => void
}) {
  const store = useStore()
  return (
    <div className="rounded-md border border-[#1e293b] bg-[#0d152f] p-4">
      <p className="font-heading text-xs font-extrabold uppercase tracking-[0.25em] text-orange-300">When / Do</p>
      <p className="mt-1 text-xs text-slate-400">These run when you open the app, or on a timer while it stays open.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="chassis" data-testid="mc-preset-autofill" onClick={() => setAutomation(preset(channel, 'autofill'))}>Fill up to 60</Button>
        <Button size="sm" variant="chassis" onClick={() => setAutomation(preset(channel, 'refresh'))}>New tapes weekly</Button>
        <Button size="sm" variant="chassis" onClick={() => setAutomation(preset(channel, 'retire-dead'))}>Pull broken links</Button>
        <Button size="sm" variant="chassis" onClick={() => setAutomation(preset(channel, 'shuffle'))}>Shuffle daily</Button>
        <Button size="sm" variant="chassis" onClick={() => setAutomation(preset(channel, 'daypart'))}>Morning / night</Button>
        <Button size="sm" variant="chassis" onClick={() => setAutomation(preset(channel, 'takeover'))}>Holiday takeover</Button>
      </div>
      {automation && (
        <div className="mt-3 grid gap-2">
          <input className={field} value={automation.name} onChange={(event) => setAutomation({ ...automation, name: event.target.value })} aria-label="Automation name" />
          <select className={field} value={automation.when} onChange={(event) => setAutomation({ ...automation, when: event.target.value as AutomationWhen })} aria-label="When">
            <option value="open">When the app opens</option>
            <option value="hourly">Every hour</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
          </select>
          {(automation.action.kind === 'autofill' || automation.action.kind === 'refresh' || automation.action.kind === 'takeover') && (
            <input
              data-testid="mc-auto-query"
              className={field}
              value={automation.action.query}
              onChange={(event) => setAutomation(withQuery(automation, event.target.value))}
              aria-label="Search words"
            />
          )}
          {automation.action.kind === 'autofill' && (
            <input
              data-testid="mc-auto-target"
              className={field}
              value={String(automation.action.target)}
              onChange={(event) => setAutomation(withTarget(automation, Number(event.target.value) || 1))}
              aria-label="How many tapes"
            />
          )}
          {automation.action.kind === 'daypart' && (
            <>
              <input className={field} value={automation.action.morningWords} onChange={(event) => setAutomation(withDaypart(automation, 'morningWords', event.target.value))} aria-label="Morning words" />
              <input className={field} value={automation.action.nightWords} onChange={(event) => setAutomation(withDaypart(automation, 'nightWords', event.target.value))} aria-label="Night words" />
            </>
          )}
          {automation.action.kind === 'takeover' && (
            <div className="grid grid-cols-2 gap-2">
              <input className={field} type="date" value={automation.action.from} onChange={(event) => setAutomation(withTakeover(automation, 'from', event.target.value))} aria-label="From" />
              <input className={field} type="date" value={automation.action.to} onChange={(event) => setAutomation(withTakeover(automation, 'to', event.target.value))} aria-label="To" />
            </div>
          )}
          <label className="flex items-center gap-2 font-mono text-xs">
            <input type="checkbox" checked={automation.enabled} onChange={(event) => setAutomation({ ...automation, enabled: event.target.checked })} />
            Turned on
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              data-testid="mc-auto-save"
              onClick={() => {
                const saved = automation
                store.update((current) => ({
                  ...current,
                  automations: [...(current.automations ?? []).filter((item) => item.id !== saved.id), saved],
                }))
                onNote('Automation saved.')
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="navy"
              data-testid="mc-auto-run"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void runAutomation(store.network, automation)
                  .then((next) => {
                    store.update(() => next)
                    onNote(next.automationLog?.[0]?.message ?? 'Done.')
                    setBusy(false)
                  })
                  .catch(() => setBusy(false))
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Run now
            </Button>
          </div>
        </div>
      )}
      <ul className="mt-3 space-y-1">
        {networkAutos.map((item) => (
          <li key={item.id} className="flex items-center justify-between font-mono text-[11px] text-slate-300">
            <span>
              {item.enabled ? 'ON' : 'OFF'} · {item.name}
            </span>
            <button
              type="button"
              className="text-yellow-300"
              onClick={() =>
                store.update((current) => ({
                  ...current,
                  automations: (current.automations ?? []).map((auto) => (auto.id === item.id ? { ...auto, enabled: !auto.enabled } : auto)),
                }))
              }
            >
              {item.enabled ? 'Turn off' : 'Turn on'}
            </button>
          </li>
        ))}
      </ul>
      <ul data-testid="mc-auto-log" className="mt-2 max-h-28 space-y-1 overflow-y-auto">
        {log.slice(0, 6).map((item) => (
          <li key={item.id} className="font-mono text-[10px] text-slate-400">
            {item.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function withQuery(automation: Automation, query: string): Automation {
  const action = automation.action
  if (action.kind === 'autofill' || action.kind === 'refresh' || action.kind === 'takeover') {
    return { ...automation, action: { ...action, query } }
  }
  return automation
}

function withTarget(automation: Automation, target: number): Automation {
  if (automation.action.kind !== 'autofill') return automation
  return { ...automation, action: { ...automation.action, target } }
}

function withDaypart(automation: Automation, key: 'morningWords' | 'nightWords', value: string): Automation {
  if (automation.action.kind !== 'daypart') return automation
  return { ...automation, action: { ...automation.action, [key]: value } }
}

function withTakeover(automation: Automation, key: 'from' | 'to', value: string): Automation {
  if (automation.action.kind !== 'takeover') return automation
  return { ...automation, action: { ...automation.action, [key]: value } }
}

function preset(channel: Channel, kind: AutomationAction['kind']): Automation {
  const base = { id: uid(), name: kind, enabled: true, when: 'open' as const, channelId: channel.id, lastRun: null }
  if (kind === 'autofill') return { ...base, name: 'Fill this channel', action: { kind, query: channel.theme || channel.name, source: 'archive', target: 60 } }
  if (kind === 'refresh') return { ...base, name: 'New tapes weekly', when: 'weekly', action: { kind, query: channel.theme || channel.name, source: 'archive' } }
  if (kind === 'retire-dead') return { ...base, name: 'Pull broken links', when: 'daily', action: { kind } }
  if (kind === 'shuffle') return { ...base, name: 'Shuffle daily', when: 'daily', action: { kind } }
  if (kind === 'daypart') return { ...base, name: 'Morning and night', action: { kind, morningWords: 'cartoon', nightWords: 'horror', nightHour: 22 } }
  const today = new Date().toISOString().slice(0, 10)
  return { ...base, name: 'Holiday takeover', action: { kind: 'takeover', query: channel.theme || 'cartoons', source: 'archive', from: today, to: today, label: 'Special' } }
}
