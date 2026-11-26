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
  youtubePlaylistId?: string
  vimeoId?: string
  dailymotionId?: string
  pageUrl?: string
  thumbnail?: string
  year?: string
  language?: string
  retired?: boolean
  retiredReason?: string
  keep?: boolean
}

export interface Daypart {
  nightHour: number
  morningWords: string
  nightWords: string
}

export interface Takeover {
  from: string
  to: string
  label: string
  stash: Program[]
}

export interface Channel {
  id: string
  number: number
  name: string
  callsign: string
  theme: string
  look: string
  programs: Program[]
  tagline?: string
  signedOff?: boolean
  daypart?: Daypart | null
  takeover?: Takeover | null
}

export interface ChannelRule {
  id: string
  name: string
  scope: string
  enabled: boolean
  minMinutes: number | null
  maxMinutes: number | null
  yearFrom: number | null
  yearTo: number | null
  mustInclude: string
  mustExclude: string
  sources: SourceId[]
  blockDuplicates: boolean
  hideAdult: boolean
  maxTapes: number | null
  language: string
}

export type AutomationWhen = 'open' | 'hourly' | 'daily' | 'weekly'

export type AutomationAction =
  | { kind: 'autofill'; query: string; source: SourceId; target: number }
  | { kind: 'refresh'; query: string; source: SourceId }
  | { kind: 'retire-dead' }
  | { kind: 'shuffle' }
  | { kind: 'daypart'; morningWords: string; nightWords: string; nightHour: number }
  | { kind: 'takeover'; query: string; source: SourceId; from: string; to: string; label: string }

export interface Automation {
  id: string
  name: string
  enabled: boolean
  when: AutomationWhen
  channelId: string
  action: AutomationAction
  lastRun: number | null
}

export interface AutoLog {
  id: string
  at: number
  automationId: string
  message: string
}

export interface WrongReport {
  id: string
  programId: string
  channelId: string
  title: string
  note: string
  status: 'open' | 'fixed'
  createdAt: number
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
  logoText?: string
  blockedWords?: string[]
  junkWords?: string[]
  rules?: ChannelRule[]
  automations?: Automation[]
  automationLog?: AutoLog[]
  reports?: WrongReport[]
  lastCleanup?: string[]
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
  aspect: '4:3',
  muted: false,
  volume: 0.7,
  rate: 1,
  logo: true,
  shake: false,
  guideScroll: true,
  favs: [],
  recent: [],
}
