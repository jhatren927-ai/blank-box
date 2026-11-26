import type { Channel, Program } from '../types.ts'

export interface LiveSlot {
  index: number
  program: Program
  offsetSec: number
  startMs: number
  endMs: number
}

export interface AirSlot {
  program: Program
  startMs: number
  endMs: number
}

export function programDuration(program: Program): number {
  const seconds = Math.round(program.durationSec)
  // A playlist is one continuous item; individual YouTube videos use their
  // measured duration (or a short fallback until the iframe API reports it).
  if (program.youtubePlaylistId) return 24 * 60 * 60
  if (program.youtubeId && seconds >= 24 * 60 * 60) return 10 * 60
  if (seconds >= 15) return seconds
  return 10 * 60
}

function phase(id: string, total: number): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash) % total
}

function wordHit(title: string, words: string): boolean {
  const parts = words.toLowerCase().split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return false
  const hay = title.toLowerCase()
  return parts.some((part) => hay.includes(part))
}

/** Tapes the guide may air: not pulled, and matching the daypart when one is set. */
export function onAirPrograms(channel: Channel, nowMs: number): Program[] {
  const daypart = channel.daypart
  const hour = new Date(nowMs).getHours()
  const night = !!daypart && (hour >= daypart.nightHour || hour < 5)
  return channel.programs.filter((program) => {
    if (program.retired) return false
    if (!daypart) return true
    const morningHit = wordHit(program.title, daypart.morningWords)
    const nightHit = wordHit(program.title, daypart.nightWords)
    if (!morningHit && !nightHit) return true
    return night ? nightHit || !morningHit : morningHit || !nightHit
  })
}

export function liveSlot(channel: Channel, nowMs: number): LiveSlot | null {
  const programs = onAirPrograms(channel, nowMs)
  if (programs.length === 0) return null
  const durations = programs.map(programDuration)
  const total = durations.reduce((sum, seconds) => sum + seconds, 0)
  if (total <= 0) return null
  let elapsed = (Math.floor(nowMs / 1000) + phase(channel.id, total)) % total
  for (let index = 0; index < durations.length; index++) {
    const seconds = durations[index]
    if (elapsed < seconds) {
      const startMs = (Math.floor(nowMs / 1000) - elapsed) * 1000
      return {
        index,
        program: programs[index],
        offsetSec: elapsed,
        startMs,
        endMs: startMs + seconds * 1000,
      }
    }
    elapsed -= seconds
  }
  return null
}

export function slotsCovering(channel: Channel, fromMs: number, toMs: number): AirSlot[] {
  const programs = onAirPrograms(channel, fromMs)
  const first = liveSlot(channel, fromMs)
  if (!first || programs.length === 0) return []
  const durations = programs.map(programDuration)
  const slots: AirSlot[] = []
  let index = first.index
  let cursor = first.startMs
  while (cursor < toMs && slots.length < 400) {
    const endMs = cursor + durations[index] * 1000
    if (endMs > fromMs) {
      slots.push({ program: programs[index], startMs: cursor, endMs })
    }
    cursor = endMs
    index = (index + 1) % programs.length
  }
  return slots
}

export function nextSlot(channel: Channel, nowMs: number): AirSlot | null {
  const live = liveSlot(channel, nowMs)
  const programs = onAirPrograms(channel, nowMs)
  if (!live || programs.length === 0) return null
  const durations = programs.map(programDuration)
  const index = (live.index + 1) % programs.length
  return {
    program: programs[index],
    startMs: live.endMs,
    endMs: live.endMs + durations[index] * 1000,
  }
}

export function guideWindow(nowMs: number): { start: number; end: number } {
  const slot = 30 * 60 * 1000
  const start = Math.floor(nowMs / slot) * slot
  return { start, end: start + slot * 3 }
}

export function loopSeconds(channel: Channel): number {
  return onAirPrograms(channel, Date.now()).reduce((sum, program) => sum + programDuration(program), 0)
}
