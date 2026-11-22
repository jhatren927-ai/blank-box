export type SourceId =
  | 'archive'
  | 'youtube'
  | 'vimeo'
  | 'dailymotion'
  | 'wikimedia'
  | 'nasa'
  | 'file'
  | 'hls'
  | 'dash'

export interface Program {
  id: string
  remoteId: string
  source: SourceId
  title: string
  durationSec: number
  durationGuess: boolean
  playUrl?: string
  youtubeId?: string
  vimeoId?: string
  dailymotionId?: string
  pageUrl?: string
  thumbnail?: string
  year?: string
}

export interface Channel {
  id: string
  number: number
  name: string
  callsign: string
  theme: string
  look: string
  programs: Program[]
}

export interface PinLock {
  salt: string
  hash: string
}

export interface Network {
  version: 1
  id: string
  name: string
  createdAt: number
  channels: Channel[]
  pin: PinLock | null
}

export interface Prefs {
  crt: boolean
  aspect: '16:9' | '4:3'
  muted: boolean
  volume: number
  rate: number
  logo: boolean
  shake: boolean
  guideScroll: boolean
  favs: string[]
  recent: string[]
}

export interface SearchHit {
  id: string
  source: SourceId
  title: string
  year?: string
  blurb?: string
  thumb?: string
  durationSec?: number
}

export const DEFAULT_PREFS: Prefs = {
  crt: true,
  aspect: '16:9',
  muted: true,
  volume: 0.7,
  rate: 1,
  logo: true,
  shake: false,
  guideScroll: true,
  favs: [],
  recent: [],
}
