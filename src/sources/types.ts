import type { Program, SearchHit, SourceId } from '../types.ts'

export interface SearchOptions {
  page: number
  /** When true, archive.org search is not limited to public-domain and Creative Commons collections. */
  archiveAll: boolean
  hideAdult: boolean
}

/**
 * Every video source sits behind this interface.
 * Search is null when the source has no keyless search (paste a link instead).
 * fromHit turns a search row into a scheduled program.
 * fromPaste turns a URL, a playlist URL, or M3U text into one or more programs.
 */
export interface SourceAdapter {
  id: SourceId
  label: string
  search: ((query: string, options: SearchOptions) => Promise<SearchHit[]>) | null
  fromHit: ((hit: SearchHit) => Promise<Program | null>) | null
  fromPaste: ((text: string) => Promise<Program[]>) | null
}
