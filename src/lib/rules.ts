import type { Channel, ChannelRule, Network, Program, SourceId } from '../types.ts'
import { isAdultText } from './adult.ts'

export interface Verdict {
  pass: boolean
  reasons: string[]
}

export function tapeKey(program: Program): string {
  return `${program.source}:${program.remoteId || program.youtubeId || program.playUrl || program.title}`
}

export function blankRule(scope: string): ChannelRule {
  return {
    id: crypto.randomUUID(),
    name: 'My rule',
    scope,
    enabled: true,
    minMinutes: null,
    maxMinutes: null,
    yearFrom: null,
    yearTo: null,
    mustInclude: '',
    mustExclude: '',
    sources: [],
    blockDuplicates: false,
    hideAdult: false,
    maxTapes: null,
    language: '',
  }
}

function words(value: string): string[] {
  return value.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean)
}

function textOf(program: Program): string {
  return `${program.title} ${program.remoteId}`.toLowerCase()
}

function yearOf(program: Program): number | null {
  const match = (program.year ?? '').match(/\d{4}/)
  return match ? Number(match[0]) : null
}

export function judge(
  program: Program,
  channel: Channel,
  network: Network,
  activeCount = channel.programs.filter((item) => !item.retired).length,
): Verdict {
  if (program.keep) return { pass: true, reasons: [] }
  const reasons: string[] = []
  const text = textOf(program)
  for (const word of network.blockedWords ?? []) {
    if (word && text.includes(word.toLowerCase())) reasons.push(`blocked word “${word}”`)
  }
  for (const word of network.junkWords ?? []) {
    if (word && text.includes(word.toLowerCase())) reasons.push(`junk list “${word}”`)
  }
  for (const rule of (network.rules ?? []).filter((item) => item.enabled && (item.scope === 'network' || item.scope === channel.id))) {
    const minutes = program.durationSec / 60
    if (rule.minMinutes != null && minutes < rule.minMinutes) reasons.push(`shorter than ${rule.minMinutes} min`)
    if (rule.maxMinutes != null && minutes > rule.maxMinutes) reasons.push(`longer than ${rule.maxMinutes} min`)
    const year = yearOf(program)
    if (rule.yearFrom != null && year != null && year < rule.yearFrom) reasons.push(`before ${rule.yearFrom}`)
    if (rule.yearTo != null && year != null && year > rule.yearTo) reasons.push(`after ${rule.yearTo}`)
    for (const word of words(rule.mustInclude)) {
      if (!text.includes(word)) reasons.push(`title must include “${word}”`)
    }
    for (const word of words(rule.mustExclude)) {
      if (text.includes(word)) reasons.push(`title has “${word}”`)
    }
    if (rule.sources.length > 0 && !rule.sources.includes(program.source)) reasons.push('that source is turned off')
    if (rule.hideAdult && isAdultText(program.title)) reasons.push('grown-up title')
    if (rule.maxTapes != null && activeCount >= rule.maxTapes) reasons.push(`already ${rule.maxTapes} tapes`)
    if (rule.language.trim()) {
      const want = rule.language.trim().toLowerCase()
      const have = (program.language ?? '').toLowerCase()
      if (have && !have.startsWith(want) && !want.startsWith(have)) reasons.push(`language is ${program.language}`)
    }
    if (rule.blockDuplicates) {
      const key = tapeKey(program)
      const elsewhere = network.channels.some(
        (other) =>
          other.id !== channel.id &&
          !other.signedOff &&
          other.programs.some((item) => !item.retired && tapeKey(item) === key),
      )
      if (elsewhere) reasons.push('already on another channel')
    }
  }
  return { pass: reasons.length === 0, reasons }
}

export function tally(channel: Channel, network: Network): { pass: number; fail: number } {
  const rows = channel.programs.filter((program) => !program.retired).map((program) => judge(program, channel, network))
  return { pass: rows.filter((row) => row.pass).length, fail: rows.filter((row) => !row.pass).length }
}

export function cleanupChannel(channel: Channel, network: Network): { channel: Channel; pulled: string[] } {
  const pulled: string[] = []
  const programs = channel.programs.map((program) => {
    if (program.retired || program.keep) return program
    const verdict = judge(program, channel, network)
    if (verdict.pass) return program
    pulled.push(program.id)
    return { ...program, retired: true, retiredReason: verdict.reasons.join(', ') }
  })
  return { channel: { ...channel, programs }, pulled }
}

export const SOURCE_CHOICES: SourceId[] = [
  'archive',
  'youtube',
  'vimeo',
  'dailymotion',
  'wikimedia',
  'nasa',
  'file',
  'hls',
  'dash',
]
