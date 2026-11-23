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

export function liveSlot(channel: Channel, nowMs: number): LiveSlot | null {
  if (channel.programs.length === 0) return null
  const durations = channel.programs.map(programDuration)
  const total = durations.reduce((sum, seconds) => sum + seconds, 0)
  if (total <= 0) return null
  let elapsed = (Math.floor(nowMs / 1000) + phase(channel.id, total)) % total
  for (let index = 0; index < durations.length; index++) {
    const seconds = durations[index]
    if (elapsed < seconds) {
      const startMs = (Math.floor(nowMs / 1000) - elapsed) * 1000
      return {
        index,
        program: channel.programs[index],
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
  const first = liveSlot(channel, fromMs)
  if (!first) return []
  const durations = channel.programs.map(programDuration)
  const slots: AirSlot[] = []
  let index = first.index
  let cursor = first.startMs
  while (cursor < toMs && slots.length < 400) {
    const endMs = cursor + durations[index] * 1000
    if (endMs > fromMs) {
      slots.push({ program: channel.programs[index], startMs: cursor, endMs })
    }
    cursor = endMs
    index = (index + 1) % channel.programs.length
  }
  return slots
}

export function nextSlot(channel: Channel, nowMs: number): AirSlot | null {
  const live = liveSlot(channel, nowMs)
  if (!live) return null
  const durations = channel.programs.map(programDuration)
  const index = (live.index + 1) % channel.programs.length
  return {
    program: channel.programs[index],
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
  return channel.programs.reduce((sum, program) => sum + programDuration(program), 0)
}
