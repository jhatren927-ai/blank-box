import type { Program, SearchHit } from '../types.ts'
import { isAdultText } from '../lib/adult.ts'
import { uid } from '../lib/format.ts'
import type { SearchOptions, SourceAdapter } from './types.ts'

interface WikiPage {
  title?: string
  imageinfo?: Array<{
    url?: string
    mime?: string
    duration?: number
    thumburl?: string
    descriptionurl?: string
  }>
}

async function searchCommons(query: string, options: SearchOptions): Promise<SearchHit[]> {
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrsearch', `${query} filetype:video`)
  url.searchParams.set('gsrnamespace', '6')
  url.searchParams.set('gsrlimit', '12')
  url.searchParams.set('gsroffset', String(Math.max(0, options.page - 1) * 12))
  url.searchParams.set('prop', 'imageinfo')
  url.searchParams.set('iiprop', 'url|mime|size|thumburl')
  url.searchParams.set('iiurlwidth', '320')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  const response = await fetch(url)
  if (!response.ok) throw new Error('Wikimedia did not answer.')
  const data = (await response.json()) as { query?: { pages?: Record<string, WikiPage> } }
  const hits: SearchHit[] = []
  for (const page of Object.values(data.query?.pages ?? {})) {
    const info = page.imageinfo?.[0]
    if (!page.title || !info?.url || !info.mime?.startsWith('video/')) continue
    const title = page.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replaceAll('_', ' ')
    if (options.hideAdult && isAdultText(title)) continue
    hits.push({
      id: page.title,
      source: 'wikimedia',
      title,
      thumb: info.thumburl,
      durationSec: info.duration,
      blurb: 'Wikimedia Commons',
    })
  }
  return hits
}

async function fromTitle(title: string, fallback?: SearchHit): Promise<Program | null> {
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('titles', title)
  url.searchParams.set('prop', 'imageinfo')
  url.searchParams.set('iiprop', 'url|mime|size')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  const response = await fetch(url)
  if (!response.ok) return null
  const data = (await response.json()) as { query?: { pages?: Record<string, WikiPage> } }
  const page = Object.values(data.query?.pages ?? {})[0]
  const info = page?.imageinfo?.[0]
  if (!info?.url || !info.mime?.startsWith('video/')) return null
  const seconds = info.duration || fallback?.durationSec || 0
  const nice = title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replaceAll('_', ' ')
  return {
    id: uid(),
    remoteId: title,
    source: 'wikimedia',
    title: nice,
    durationSec: seconds >= 15 ? Math.round(seconds) : 10 * 60,
    durationGuess: seconds < 15,
    playUrl: info.url,
    pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
    thumbnail: fallback?.thumb,
  }
}

export const wikimediaAdapter: SourceAdapter = {
  id: 'wikimedia',
  label: 'Wikimedia',
  search: searchCommons,
  fromHit: (hit) => fromTitle(hit.id, hit),
  fromPaste: async (text) => {
    const match = text.match(/commons\.wikimedia\.org\/wiki\/(File:[^#?\s]+)/)
    if (!match) return []
    const program = await fromTitle(decodeURIComponent(match[1]))
    return program ? [program] : []
  },
}
