import type { Network } from '../types.ts'

export const CLOUD_SAVE_URL = 'https://blank-box-save.blankbox-tv.workers.dev'
const KEY_STORAGE = 'blankbox-cloud-key'

export function getCloudKey(): string | null {
  try { return localStorage.getItem(KEY_STORAGE) } catch { return null }
}

export function getCloudKeyFromInput(value: string): string | null {
  const trimmed = value.trim()
  if (/^[a-f0-9]{48}$/i.test(trimmed)) return trimmed.toLowerCase()
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
    headers: { 'Content-Type': 'application/json' },
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
  if (!/^[a-f0-9]{48}$/i.test(key)) throw new Error('That saved lineup link is not valid.')
  const response = await fetch(`${CLOUD_SAVE_URL}/api/networks/${key.toLowerCase()}`, { cache: 'no-store' })
  const result = await response.json() as { network?: Network; error?: string }
  if (!response.ok || !result.network) throw new Error(result.error || 'Could not load that saved lineup.')
  localStorage.setItem(KEY_STORAGE, key.toLowerCase())
  return result.network
}

export function cloudShareUrl(key: string): string {
  return `https://jhatren927-ai.github.io/blank-box/?load=${key}`
}
