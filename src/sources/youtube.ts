import type { Program } from '../types.ts'
import { uid } from '../lib/format.ts'
import type { SourceAdapter } from './types.ts'

interface OEmbed {
  title?: string
  author_name?: string
  thumbnail_url?: string
}

let apiPromise: Promise<YTNamespace> | null = null

export function loadYouTubeAPI(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  const pending = new Promise<YTNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('YouTube did not load.')), 15000)
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer)
      previous?.()
      if (window.YT) resolve(window.YT)
      else reject(new Error('YouTube did not load.'))
    }
    if (!document.querySelector('script[data-youtube-iframe]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.dataset.youtubeIframe = '1'
      document.head.appendChild(script)
    }
  })
  apiPromise = pending.catch((error: unknown) => {
    apiPromise = null
    throw error
  })
  return apiPromise
}

export function parseYouTube(
  input: string,
): { kind: 'video'; id: string } | { kind: 'playlist'; id: string } | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id ? { kind: 'video', id } : null
  }
  if (!host.endsWith('youtube.com') && host !== 'youtube-nocookie.com') return null
  const videoId = url.searchParams.get('v')
  const listId = url.searchParams.get('list')
  if (url.pathname.startsWith('/playlist') && listId) return { kind: 'playlist', id: listId }
  if (videoId && /^[\w-]{6,}$/.test(videoId)) return { kind: 'video', id: videoId }
  const parts = url.pathname.split('/').filter(Boolean)
  if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1]) {
    return { kind: 'video', id: parts[1] }
  }
  if (listId && !videoId) return { kind: 'playlist', id: listId }
  return null
}

async function oEmbed(id: string): Promise<OEmbed | null> {
  const page = `https://www.youtube.com/watch?v=${id}`
  const response = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(page)}&format=json`,
  )
  if (!response.ok) return null
  return (await response.json()) as OEmbed
}

export function youtubeProgram(id: string, meta: OEmbed | null): Program {
  return {
    id: uid(),
    remoteId: id,
    source: 'youtube',
    title: meta?.title || 'YouTube video',
    durationSec: 24 * 60 * 60,
    durationGuess: false,
    youtubeId: id,
    pageUrl: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: meta?.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    year: meta?.author_name,
  }
}

export function youtubePlaylistProgram(listId: string): Program {
  return {
    id: uid(),
    remoteId: listId,
    source: 'youtube',
    title: 'YouTube playlist',
    // A playlist is one continuous scheduled item. YouTube owns each video's
    // actual duration and advances to the next item without a guessed cutoff.
    durationSec: 24 * 60 * 60,
    durationGuess: false,
    youtubePlaylistId: listId,
    pageUrl: `https://www.youtube.com/playlist?list=${listId}`,
  }
}

async function programsFromPaste(text: string): Promise<Program[]> {
  const lines = text
    .split(/\\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const programs: Program[] = []
  for (const line of lines) {
    const parsed = parseYouTube(line)
    if (!parsed) continue
    if (parsed.kind === 'playlist') {
      programs.push(youtubePlaylistProgram(parsed.id))
      continue
    }
    programs.push(youtubeProgram(parsed.id, await oEmbed(parsed.id)))
  }
  if (programs.length === 0 && text.trim()) {
    throw new Error('Paste a YouTube video or playlist link.')
  }
  return programs
}

export const youtubeAdapter: SourceAdapter = {
  id: 'youtube',
  label: 'YouTube',
  search: null,
  fromHit: null,
  fromPaste: programsFromPaste,
}
