import type { SourceId } from '../types.ts'
import { archiveAdapter } from './archive.ts'
import { dailymotionAdapter } from './dailymotion.ts'
import { directAdapter } from './direct.ts'
import { nasaAdapter } from './nasa.ts'
import type { SourceAdapter } from './types.ts'
import { vimeoAdapter } from './vimeo.ts'
import { wikimediaAdapter } from './wikimedia.ts'
import { youtubeAdapter } from './youtube.ts'

export type { SearchOptions, SourceAdapter } from './types.ts'

/**
 * Source adapters. Add a new legal, keyless source by implementing SourceAdapter
 * and appending it here. The builder and the player only talk to this list.
 *
 * Playback is separate: the player looks at Program.source / youtubeId / vimeoId /
 * dailymotionId / playUrl. Adapters should fill those fields and a duration.
 */
export const adapters: SourceAdapter[] = [
  archiveAdapter,
  youtubeAdapter,
  directAdapter,
  vimeoAdapter,
  dailymotionAdapter,
  wikimediaAdapter,
  nasaAdapter,
]

const byId = new Map<SourceId, SourceAdapter>(adapters.map((adapter) => [adapter.id, adapter]))

export function adapterFor(id: SourceId): SourceAdapter | undefined {
  if (id === 'hls' || id === 'dash') return directAdapter
  return byId.get(id)
}
