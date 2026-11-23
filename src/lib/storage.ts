import { DEFAULT_PREFS, type Network, type Prefs } from '../types.ts'
import { networkName } from './names.ts'
import { uid } from './format.ts'

export const NETWORK_KEY = 'blankbox:network:v1'
export const PREFS_KEY = 'blankbox:prefs:v1'
const SEED_KEY = 'blankbox:seed'

function sessionGet(key: string): string | null {
  try { return window.sessionStorage.getItem(key) } catch { return null }
}
function sessionSet(key: string, value: string): void {
  try { window.sessionStorage.setItem(key, value) } catch { /* Private browsing or storage disabled. */ }
}
function sessionRemove(key: string): void {
  try { window.sessionStorage.removeItem(key) } catch { /* Storage may be unavailable. */ }
}

export function freshNetwork(): Network {
  let seed = sessionGet(SEED_KEY)
  if (!seed) {
    seed = String(Date.now())
    sessionSet(SEED_KEY, seed)
  }
  return {
    version: 1,
    id: `net-${seed}`,
    name: networkName(seed),
    createdAt: Number(seed) || Date.now(),
    channels: [],
    pin: null,
  }
}

export function readNetwork(): Network | null {
  try {
    const raw = window.localStorage.getItem(NETWORK_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<Network>
    if (
      data?.version !== 1 ||
      !Array.isArray(data.channels) ||
      typeof data.name !== 'string' ||
      typeof data.id !== 'string'
    ) return null
    return {
      version: 1,
      id: data.id,
      name: data.name,
      createdAt: Number.isFinite(data.createdAt) ? Number(data.createdAt) : Date.now(),
      channels: data.channels.filter((channel) =>
        channel && typeof channel === 'object' &&
        typeof channel.id === 'string' &&
        Number.isFinite(channel.number) &&
        Array.isArray(channel.programs),
      ) as Network['channels'],
      pin: data.pin && typeof data.pin.salt === 'string' && typeof data.pin.hash === 'string'
        ? data.pin
        : null,
    }
  } catch {
    return null
  }
}

export function loadNetwork(): Network {
  return readNetwork() ?? freshNetwork()
}

export function writeNetwork(network: Network): boolean {
  try {
    window.localStorage.setItem(NETWORK_KEY, JSON.stringify(network))
    return true
  } catch (error) {
    console.warn('Blank Box could not persist the lineup locally:', error)
    return false
  }
}

export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const data = JSON.parse(raw) as Partial<Prefs>
    const volume = Number(data.volume)
    const rate = Number(data.rate)
    // Earlier releases shipped with mute enabled by default. Migrate existing
    // installs once so the TV starts with audible sound unless the user mutes it again.
    const audioDefaultMigrated = window.localStorage.getItem('blankbox:audio-default-v2') === '1'
    if (!audioDefaultMigrated) window.localStorage.setItem('blankbox:audio-default-v2', '1')
    return {
      ...DEFAULT_PREFS,
      ...data,
      muted: audioDefaultMigrated ? data.muted === true : false,
      volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : DEFAULT_PREFS.volume,
      rate: Number.isFinite(rate) ? Math.max(0.25, Math.min(2, rate)) : DEFAULT_PREFS.rate,
      favs: Array.isArray(data.favs) ? data.favs.filter((id): id is string => typeof id === 'string') : [],
      recent: Array.isArray(data.recent) ? data.recent.filter((id): id is string => typeof id === 'string') : [],
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writePrefs(prefs: Prefs): boolean {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    return true
  } catch (error) {
    console.warn('Blank Box could not persist preferences locally:', error)
    return false
  }
}

export function safeSessionGet(key: string): string | null { return sessionGet(key) }
export function safeSessionSet(key: string, value: string): void { sessionSet(key, value) }
export function safeSessionRemove(key: string): void { sessionRemove(key) }

export function newId(): string {
  return uid()
}

export function clearSeed() {
  sessionRemove(SEED_KEY)
}
