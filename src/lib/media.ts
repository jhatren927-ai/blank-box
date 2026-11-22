import type { Program, SourceId } from '../types.ts'
import { safeHttpUrl, uid } from './format.ts'

export function classifyPlayable(url: string): 'hls' | 'dash' | 'file' {
  const path = url.split('?')[0].toLowerCase()
  if (path.endsWith('.m3u8') || path.endsWith('.m3u')) return 'hls'
  if (path.endsWith('.mpd')) return 'dash'
  return 'file'
}

export function sourceForUrl(url: string): SourceId {
  return classifyPlayable(url)
}

export function parseClock(value: string): number {
  const parts = value.split(':').map((part) => Number(part))
  if (parts.some((part) => !Number.isFinite(part))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] ?? 0
}

export function parseIsoDuration(value: string): number {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/)
  if (!match) return 0
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)
}

export interface M3UItem {
  title: string
  url: string
  durationSec: number
}

export function parseM3U(text: string): M3UItem[] {
  const items: M3UItem[] = []
  let pending: { title: string; durationSec: number } | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#EXTINF')) {
      const body = line.slice(8)
      const comma = body.indexOf(',')
      const duration = Number(comma === -1 ? body : body.slice(0, comma))
      const title = (comma === -1 ? '' : body.slice(comma + 1)).trim() || 'Show'
      pending = { title, durationSec: Number.isFinite(duration) && duration > 0 ? duration : 0 }
      continue
    }
    if (line.startsWith('#')) continue
    const url = safeHttpUrl(line)
    if (!url) continue
    items.push({
      title: pending?.title || 'Show',
      url,
      durationSec: pending?.durationSec || 0,
    })
    pending = null
  }
  return items
}

export function programFromUrl(url: string, title: string, durationSec = 0): Program {
  const source = sourceForUrl(url)
  const guess = durationSec < 15
  return {
    id: uid(),
    remoteId: url,
    source,
    title: title || 'Show',
    durationSec: guess ? (source === 'hls' ? 30 * 60 : 10 * 60) : Math.round(durationSec),
    durationGuess: guess,
    playUrl: url,
    pageUrl: url,
  }
}

async function hlsDuration(url: string, depth = 0): Promise<number> {
  if (depth > 2) return 0
  const response = await fetch(url)
  if (!response.ok) return 0
  const text = await response.text()
  if (text.includes('#EXT-X-STREAM-INF')) {
    const variant = text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'))
    if (!variant) return 0
    return hlsDuration(new URL(variant, url).toString(), depth + 1)
  }
  let total = 0
  for (const line of text.split('\n')) {
    if (!line.startsWith('#EXTINF:')) continue
    const seconds = Number.parseFloat(line.slice(8))
    if (Number.isFinite(seconds)) total += seconds
  }
  return total
}

export async function enrichDuration(program: Program): Promise<Program> {
  if (!program.playUrl || !program.durationGuess) return program
  try {
    if (program.source === 'hls') {
      const seconds = await hlsDuration(program.playUrl)
      if (seconds >= 15) return { ...program, durationSec: Math.round(seconds), durationGuess: false }
      return program
    }
    if (program.source === 'dash') {
      const response = await fetch(program.playUrl)
      if (!response.ok) return program
      const text = await response.text()
      const match = text.match(/mediaPresentationDuration="([^"]+)"/)
      const seconds = match ? parseIsoDuration(match[1]) : 0
      if (seconds >= 15) return { ...program, durationSec: Math.round(seconds), durationGuess: false }
      return program
    }
    if (program.source === 'file') {
      const seconds = await probeVideo(program.playUrl)
      if (seconds >= 15) return { ...program, durationSec: Math.round(seconds), durationGuess: false }
    }
  } catch {
    return program
  }
  return program
}

function probeVideo(url: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    const finish = (seconds: number) => {
      video.removeAttribute('src')
      video.load()
      resolve(seconds)
    }
    const timer = window.setTimeout(() => finish(0), 8000)
    video.onloadedmetadata = () => {
      window.clearTimeout(timer)
      finish(Number.isFinite(video.duration) ? video.duration : 0)
    }
    video.onerror = () => {
      window.clearTimeout(timer)
      finish(0)
    }
    video.src = url
  })
}
