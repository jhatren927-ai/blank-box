import type { Program, SearchHit } from '../types.ts'
import { isAdultText } from '../lib/adult.ts'
import { uid } from '../lib/format.ts'
import { parseClock } from '../lib/media.ts'
import type { SearchOptions, SourceAdapter } from './types.ts'

interface NasaItem {
  href?: string
  data?: Array<{ nasa_id?: string; title?: string; description?: string; date_created?: string }>
  links?: Array<{ href?: string; rel?: string }>
}

function pickMp4(urls: string[]): string | null {
  const mp4 = urls.filter((url) => /\.mp4($|\?)/i.test(url))
  const rank = (url: string) => {
    if (url.includes('~mobile.')) return 0
    if (url.includes('~small.')) return 1
    if (url.includes('~preview.')) return 2
    if (url.includes('~orig.')) return 4
    return 3
  }
  return mp4.sort((a, b) => rank(a) - rank(b))[0] ?? null
}

async function durationFromCollection(urls: string[]): Promise<number> {
  const meta = urls.find((url) => url.endsWith('metadata.json'))
  if (!meta) return 0
  try {
    const response = await fetch(meta)
    if (!response.ok) return 0
    const text = await response.text()
    const match = text.match(/MediaDuration[^0-9]{0,12}(\d+:\d+:\d+)/) ?? text.match(/"Duration":"(\d+:\d+:\d+)"/)
    return match ? parseClock(match[1]) : 0
  } catch {
    return 0
  }
}

async function searchNasa(query: string, options: SearchOptions): Promise<SearchHit[]> {
  const url = new URL('https://images-api.nasa.gov/search')
  url.searchParams.set('q', query)
  url.searchParams.set('media_type', 'video')
  url.searchParams.set('page_size', '16')
  url.searchParams.set('page', String(Math.max(1, options.page)))
  const response = await fetch(url)
  if (!response.ok) throw new Error('NASA did not answer.')
  const data = (await response.json()) as { collection?: { items?: NasaItem[] } }
  const hits: SearchHit[] = []
  for (const item of data.collection?.items ?? []) {
    const info = item.data?.[0]
    if (!info?.nasa_id || !info.title || !item.href) continue
    if (options.hideAdult && isAdultText(info.title, info.description)) continue
    hits.push({
      id: item.href,
      source: 'nasa',
      title: info.title,
      year: info.date_created?.slice(0, 4),
      blurb: info.description?.replace(/\s+/g, ' ').slice(0, 140),
      thumb: item.links?.find((link) => link.rel === 'preview')?.href,
    })
  }
  return hits
}

async function fromCollection(collectionUrl: string, hit?: SearchHit): Promise<Program | null> {
  const response = await fetch(collectionUrl)
  if (!response.ok) return null
  const urls = (await response.json()) as string[]
  if (!Array.isArray(urls)) return null
  const playUrl = pickMp4(urls)
  if (!playUrl) return null
  const seconds = await durationFromCollection(urls)
  return {
    id: uid(),
    remoteId: collectionUrl,
    source: 'nasa',
    title: hit?.title || 'NASA video',
    durationSec: seconds >= 15 ? Math.round(seconds) : 10 * 60,
    durationGuess: seconds < 15,
    playUrl,
    pageUrl: 'https://images.nasa.gov/',
    thumbnail: hit?.thumb,
    year: hit?.year,
  }
}

export const nasaAdapter: SourceAdapter = {
  id: 'nasa',
  label: 'NASA',
  search: searchNasa,
  fromHit: (hit) => fromCollection(hit.id, hit),
  fromPaste: async () => [],
}
