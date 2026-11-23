import type { Network } from '../types.ts'

export const CLOUD_SAVE_URL = 'https://blank-box-save.blankbox-tv.workers.dev'
const KEY_STORAGE = 'blankbox-cloud-key'

export function getCloudKey(): string | null {
  try { return localStorage.getItem(KEY_STORAGE) } catch { return null }
}

export function getCloudKeyFromInput(value: string): string | null {
  const trimmed = value.trim()
  if (/^[a-f0-9]{48}$/i.test(trimmed)) return trimmed.toLowerCase()
  if (/^[0-9]{6}$/.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    const key = url.searchParams.get('load')
    return key && /^[a-f0-9]{48}$/i.test(key) ? key.toLowerCase() : null
  } catch { return null }
}

export async function saveCloudNetwork(network: Network): Promise<string> {
  const existing = getCloudKey()
  const response = await fetch(existing ? `${CLOUD_SAVE_URL}/api/networks/${existing}` : `${CLOUD_SAVE_URL}/api/networks`, {
    method: existing ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('blankbox-license-session') ? { Authorization: `Bearer ${localStorage.getItem('blankbox-license-session')}` } : {}) },
    body: JSON.stringify(network),
  })
  if (existing && response.status === 404) {
    localStorage.removeItem(KEY_STORAGE)
    return saveCloudNetwork(network)
  }
  const result = await response.json() as { key?: string; error?: string }
  if (!response.ok) throw new Error(result.error || `Save request failed (HTTP ${response.status}).`)
  const key = result.key || existing
  if (!key || !/^[a-f0-9]{48}$/i.test(key)) {
    throw new Error('The save service did not return a valid restore code.')
  }

  // Keep the key before checking the read-back. If verification fails, the next
  // attempt updates this same record instead of creating a duplicate.
  localStorage.setItem(KEY_STORAGE, key)
  const verifyResponse = await fetch(`${CLOUD_SAVE_URL}/api/networks/${key}`, { cache: 'no-store' })
  let verified: { network?: Network; error?: string }
  try {
    verified = await verifyResponse.json() as { network?: Network; error?: string }
  } catch {
    throw new Error(`The save request returned, but verification could not read the saved lineup (HTTP ${verifyResponse.status}). Your restore code is retained; try Update saved lineup.`)
  }
  if (!verifyResponse.ok || !verified.network) {
    throw new Error(verified.error || `The save request returned, but the lineup could not be read back (HTTP ${verifyResponse.status}). Your restore code is retained; try Update saved lineup.`)
  }
  if (JSON.stringify(verified.network) !== JSON.stringify(network)) {
    throw new Error('The save request returned, but the lineup read back did not match what you sent. It has not been confirmed; please try again.')
  }
  return key
}

export async function loadCloudNetwork(key: string): Promise<Network> {
  if (!/^(?:[a-f0-9]{48}|[0-9]{6})$/i.test(key)) throw new Error('Enter the six-digit network code or a saved lineup link.')
  const response = await fetch(`${CLOUD_SAVE_URL}/api/networks/${key.toLowerCase()}`, { cache: 'no-store' })
  const result = await response.json() as { network?: Network; key?: string; error?: string }
  if (!response.ok || !result.network) throw new Error(result.error || 'Could not load that saved lineup.')
  const restoreKey = result.key || key.toLowerCase()
  if (/^[a-f0-9]{48}$/i.test(restoreKey)) localStorage.setItem(KEY_STORAGE, restoreKey.toLowerCase())
  return result.network
}

export function cloudShareUrl(key: string): string {
  return `https://jhatren927-ai.github.io/blank-box/?load=${key}`
}


export async function getAccountNetwork(token: string): Promise<Network | null> {
  const response = await fetch(`${CLOUD_SAVE_URL}/api/account/network`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const result = await response.json() as { network?: Network | null; error?: string }
  if (!response.ok) throw new Error(result.error || `Account sync failed (HTTP ${response.status}).`)
  return result.network ?? null
}

export async function saveAccountNetwork(token: string, network: Network): Promise<void> {
  const response = await fetch(`${CLOUD_SAVE_URL}/api/account/network`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(network),
  })
  const result = await response.json() as { error?: string }
  if (!response.ok) throw new Error(result.error || `Account sync failed (HTTP ${response.status}).`)
}
