import { enrichDuration, parseM3U, programFromUrl } from '../lib/media.ts'
import { safeHttpUrl } from '../lib/format.ts'
import type { SourceAdapter } from './types.ts'

async function fromPaste(text: string) {
  if (text.includes('#EXTM3U') || text.includes('#EXTINF')) {
    const items = parseM3U(text)
    if (items.length === 0) throw new Error('That playlist did not have any video links.')
    return Promise.all(
      items.slice(0, 80).map((item) => enrichDuration(programFromUrl(item.url, item.title, item.durationSec))),
    )
  }
  const programs = []
  for (const line of text.split(/\s+/)) {
    const url = safeHttpUrl(line)
    if (!url) continue
    programs.push(await enrichDuration(programFromUrl(url, guessTitle(url))))
  }
  if (programs.length === 0) throw new Error('Paste a video link, an .m3u8 link, or a playlist.')
  return programs
}

function guessTitle(url: string): string {
  try {
    const parsed = new URL(url)
    const last = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replaceAll(/[_-]+/g, ' ')
      .trim()
    const readable = /[aeiou]/i.test(last) && last.length >= 4 && last.length < 60
    if (readable) return last.slice(0, 80)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return 'Video'
  }
}

export const directAdapter: SourceAdapter = {
  id: 'file',
  label: 'A link',
  search: null,
  fromHit: null,
  fromPaste,
}
