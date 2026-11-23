import type { Program, SearchHit } from '../types.ts'
import { isAdultText } from '../lib/adult.ts'
import { uid } from '../lib/format.ts'
import { parseClock } from '../lib/media.ts'
import type { SearchOptions, SourceAdapter } from './types.ts'

interface IaFile {
  name?: string
  format?: string
  size?: string
  length?: string | number
  height?: string
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '').slice(0, 120)}"`
}

function buildQuery(text: string, options: SearchOptions): string {
  // format:h.264 keeps the list to files the browser can play.
  // The default collections are the public-domain and Creative Commons movie sets.
  // "All of Archive.org" drops that collection limit and still skips grown-up subjects.
  let query = `(title:${quote(text)} OR subject:${quote(text)}) AND mediatype:movies AND format:"h.264"`
  if (!options.archiveAll) {
    query +=
      ' AND collection:(prelinger OR opensource_movies OR feature_films OR animationandcartoons OR classic_tv OR universal_newsreels OR documentary)'
  }
  if (options.hideAdult) {
    query +=
      ' AND NOT subject:pornography AND NOT subject:erotica AND NOT subject:"adult film" AND NOT subject:xxx AND NOT subject:hentai'
  }
  return query
}

async function searchArchive(query: string, options: SearchOptions): Promise<SearchHit[]> {
  const text = query.trim()
  if (!text) return []

  // A pasted Archive.org item URL or identifier is a direct lookup, not a
  // keyword search. The regular search endpoint treats the URL as title text.
  const direct = text.match(/(?:https?:\\/\\/(?:www\\.)?archive\\.org\\/details\\/)?([a-z0-9][a-z0-9._-]{4,99})\\/?(?:[?#].*)?$/i)
  const looksLikeUrl = /archive\\.org\\/details\\//i.test(text)
  if (direct && (looksLikeUrl || !/\\s/.test(text))) {
    const identifier = direct[1]
    const metadataResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`)
    if (metadataResponse.ok) {
      const item = (await metadataResponse.json()) as {
        metadata?: { identifier?: string; title?: string; year?: string | number; description?: string | string[]; mediatype?: string }
        files?: IaFile[]
      }
      if (item.metadata?.identifier && item.metadata.mediatype === 'movies' && pickFile(item.files ?? [])) {
        const description = Array.isArray(item.metadata.description)
          ? item.metadata.description.join(' ')
          : item.metadata.description ?? ''
        return [{
          id: item.metadata.identifier,
          source: 'archive',
          title: item.metadata.title || item.metadata.identifier,
          year: item.metadata.year ? String(item.metadata.year) : undefined,
          blurb: description.replace(/<[^>]+>/g, '').slice(0, 140),
          thumb: `https://archive.org/services/img/${item.metadata.identifier}`,
        }]
      }
      return []
    }
  }

  const url = new URL('https://archive.org/advancedsearch.php')
  url.searchParams.set('q', buildQuery(text, options))
  url.searchParams.append('fl[]', 'identifier')
  url.searchParams.append('fl[]', 'title')
  url.searchParams.append('fl[]', 'year')
  url.searchParams.append('fl[]', 'description')
  url.searchParams.set('rows', '20')
  url.searchParams.set('page', String(Math.max(1, options.page)))
  url.searchParams.set('output', 'json')
  url.searchParams.append('sort[]', 'downloads desc')
  const response = await fetch(url)
  if (!response.ok) throw new Error('Archive.org did not answer.')
  const data = (await response.json()) as {
    response?: { docs?: Array<{
      identifier?: string
      title?: string | string[]
      year?: string | number
      description?: string | string[]
    }> }
  }
  const hits: SearchHit[] = []
  for (const doc of data.response?.docs ?? []) {
    const title = Array.isArray(doc.title) ? doc.title.join(' ') : doc.title
    if (!doc.identifier || !title) continue
    const description = Array.isArray(doc.description)
      ? doc.description.join(' ')
      : typeof doc.description === 'string'
        ? doc.description
        : ''
    if (options.hideAdult && isAdultText(title, description)) continue
    hits.push({
      id: doc.identifier,
      source: 'archive',
      title,
      year: doc.year ? String(doc.year) : undefined,
      blurb: description.replace(/<[^>]+>/g, '').slice(0, 140),
      thumb: `https://archive.org/services/img/${doc.identifier}`,
    })
  }
  return hits
}

function fileLength(file: IaFile): number {
  if (typeof file.length === 'number') return file.length
  if (typeof file.length === 'string') {
    return file.length.includes(':') ? parseClock(file.length) : Number.parseFloat(file.length)
  }
  return 0
}

function pickFile(files: IaFile[]): IaFile | null {
  const videos = files.filter((file) => {
    const name = file.name ?? ''
    if (!name || /thumb|_512kb|sample/i.test(name)) return false
    return /\.(mp4|m4v|webm|ogv)$/i.test(name)
  })
  const h264 = videos.filter(
    (file) => /\.mp4$/i.test(file.name ?? '') && /h\.?264|mpeg4/i.test(file.format ?? ''),
  )
  const pool = h264.length > 0 ? h264 : videos.filter((file) => /\.mp4$/i.test(file.name ?? ''))
  const ranked = (pool.length > 0 ? pool : videos).slice().sort((a, b) => {
    const ah = Number(a.height || 480)
    const bh = Number(b.height || 480)
    return Math.abs(ah - 480) - Math.abs(bh - 480) || Number(a.size || 0) - Number(b.size || 0)
  })
  return ranked[0] ?? null
}

export async function resolveArchive(identifier: string, title = 'Show', year?: string): Promise<Program | null> {
  const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`)
  if (!response.ok) return null
  const data = (await response.json()) as { files?: IaFile[]; metadata?: { title?: string; runtime?: string } }
  const file = pickFile(data.files ?? [])
  if (!file?.name) return null
  const path = file.name.split('/').map(encodeURIComponent).join('/')
  const seconds = fileLength(file) || parseClock(data.metadata?.runtime ?? '')
  return {
    id: uid(),
    remoteId: identifier,
    source: 'archive',
    title: data.metadata?.title || title,
    durationSec: seconds >= 15 ? Math.round(seconds) : 20 * 60,
    durationGuess: seconds < 15,
    playUrl: `https://archive.org/download/${encodeURIComponent(identifier)}/${path}`,
    pageUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
    thumbnail: `https://archive.org/services/img/${identifier}`,
    year,
  }
}

export const archiveAdapter: SourceAdapter = {
  id: 'archive',
  label: 'Free movies',
  search: searchArchive,
  fromHit: (hit) => resolveArchive(hit.id, hit.title, hit.year),
  fromPaste: async (text) => {
    const match = text.trim().match(/archive\.org\/details\/([^/?#]+)/)
    if (!match) return []
    const program = await resolveArchive(decodeURIComponent(match[1]))
    return program ? [program] : []
  },
}
