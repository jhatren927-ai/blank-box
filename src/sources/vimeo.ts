import type { Program } from '../types.ts'
import { uid } from '../lib/format.ts'
import type { SourceAdapter } from './types.ts'

export function parseVimeo(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null
  const id = url.pathname.split('/').filter(Boolean).reverse().find((part) => /^\d+$/.test(part))
  return id ?? null
}

async function programFromId(id: string, page: string): Promise<Program> {
  const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(page)}`)
  if (!response.ok) throw new Error('That Vimeo link did not open.')
  const data = (await response.json()) as {
    title?: string
    duration?: number
    thumbnail_url?: string
    author_name?: string
  }
  const seconds = data.duration ?? 0
  return {
    id: uid(),
    remoteId: id,
    source: 'vimeo',
    title: data.title || 'Vimeo video',
    durationSec: seconds >= 15 ? Math.round(seconds) : 10 * 60,
    durationGuess: seconds < 15,
    vimeoId: id,
    pageUrl: page,
    thumbnail: data.thumbnail_url,
    year: data.author_name,
  }
}

export const vimeoAdapter: SourceAdapter = {
  id: 'vimeo',
  label: 'Vimeo',
  search: null,
  fromHit: null,
  fromPaste: async (text) => {
    const programs: Program[] = []
    for (const line of text.split(/\s+/)) {
      const id = parseVimeo(line)
      if (!id) continue
      programs.push(await programFromId(id, `https://vimeo.com/${id}`))
    }
    if (programs.length === 0) throw new Error('Paste a public Vimeo link.')
    return programs
  },
}
