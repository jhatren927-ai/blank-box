import { DEFAULT_PREFS, type Network, type Prefs } from '../types.ts'
import { networkName } from './names.ts'
import { uid } from './format.ts'

export const NETWORK_KEY = 'blankbox:network:v1'
export const PREFS_KEY = 'blankbox:prefs:v1'
const SEED_KEY = 'blankbox:seed'

export function freshNetwork(): Network {
  let seed = sessionStorage.getItem(SEED_KEY)
  if (!seed) {
    seed = String(Date.now())
    sessionStorage.setItem(SEED_KEY, seed)
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
    const raw = localStorage.getItem(NETWORK_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Network
    if (data?.version !== 1 || !Array.isArray(data.channels) || typeof data.name !== 'string') {
      return null
    }
    return data
  } catch {
    return null
  }
}

export function loadNetwork(): Network {
  return readNetwork() ?? freshNetwork()
}

export function writeNetwork(network: Network) {
  localStorage.setItem(NETWORK_KEY, JSON.stringify(network))
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const data = JSON.parse(raw) as Partial<Prefs>
    return { ...DEFAULT_PREFS, ...data, favs: data.favs ?? [], recent: data.recent ?? [] }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writePrefs(prefs: Prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

export function newId(): string {
  return uid()
}

export function clearSeed() {
  sessionStorage.removeItem(SEED_KEY)
}
