import type { Program, SearchHit } from '../types.ts'
import { isAdultText } from '../lib/adult.ts'
import { uid } from '../lib/format.ts'
import type { SearchOptions, SourceAdapter } from './types.ts'

interface DmVideo {
  id?: string
  title?: string
  duration?: number
  thumbnail_240_url?: string
  url?: string
}

function toProgram(video: DmVideo): Program | null {
  if (!video.id || !video.title) return null
  if (isAdultText(video.title)) return null
  const seconds = video.duration ?? 0
  return {
    id: uid(),
    remoteId: video.id,
    source: 'dailymotion',
    title: video.title,
    durationSec: seconds >= 15 ? seconds : 10 * 60,
    durationGuess: seconds < 15,
    dailymotionId: video.id,
    pageUrl: video.url || `https://www.dailymotion.com/video/${video.id}`,
    thumbnail: video.thumbnail_240_url,
  }
}

export function parseDailymotion(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'dai.ly') return url.pathname.split('/').filter(Boolean)[0] ?? null
  if (!host.endsWith('dailymotion.com')) return null
  const parts = url.pathname.split('/').filter(Boolean)
  const index = parts.indexOf('video')
  if (index >= 0 && parts[index + 1]) return parts[index + 1].split('_')[0]
  return null
}

async function searchDm(query: string, options: SearchOptions): Promise<SearchHit[]> {
  const url = new URL('https://api.dailymotion.com/videos')
  url.searchParams.set('search', query)
  url.searchParams.set('fields', 'id,title,duration,thumbnail_240_url')
  url.searchParams.set('limit', '16')
  url.searchParams.set('page', String(Math.max(1, options.page)))
  url.searchParams.set('family_filter', options.hideAdult ? 'true' : 'false')
  const response = await fetch(url)
  if (!response.ok) throw new Error('Dailymotion did not answer.')
  const data = (await response.json()) as { list?: DmVideo[] }
  return (data.list ?? []).flatMap((video) => {
    if (!video.id || !video.title) return []
    if (options.hideAdult && isAdultText(video.title)) return []
    return [
      {
        id: video.id,
        source: 'dailymotion' as const,
        title: video.title,
        thumb: video.thumbnail_240_url,
        durationSec: video.duration,
      },
    ]
  })
}

async function fromId(id: string): Promise<Program | null> {
  const response = await fetch(
    `https://api.dailymotion.com/video/${encodeURIComponent(id)}?fields=id,title,duration,thumbnail_240_url,url`,
  )
  if (!response.ok) return null
  return toProgram((await response.json()) as DmVideo)
}

export const dailymotionAdapter: SourceAdapter = {
  id: 'dailymotion',
  label: 'Dailymotion',
  search: searchDm,
  fromHit: (hit) => fromId(hit.id),
  fromPaste: async (text) => {
    const programs: Program[] = []
    for (const line of text.split(/\s+/)) {
      const id = parseDailymotion(line)
      if (!id) continue
      const program = await fromId(id)
      if (program) programs.push(program)
    }
    if (programs.length === 0) throw new Error('Paste a Dailymotion link.')
    return programs
  },
}
