import type { Network } from '../types.ts'

function bytesToB64url(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function b64urlToBytes(text: string): Uint8Array {
  const pad = text.length % 4 === 0 ? '' : '='.repeat(4 - (text.length % 4))
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

export async function encodeNetwork(network: Network): Promise<string> {
  const zipped = await gzip(JSON.stringify(network))
  return `BB1.${bytesToB64url(zipped)}`
}

export async function decodeNetwork(code: string): Promise<Network> {
  const trimmed = code.trim().replace(/\s+/g, '')
  if (!trimmed.startsWith('BB1.')) throw new Error('That code is not a Blank Box lineup.')
  const json = await gunzip(b64urlToBytes(trimmed.slice(4)))
  const data = JSON.parse(json) as Network
  if (data?.version !== 1 || typeof data.name !== 'string' || !Array.isArray(data.channels)) {
    throw new Error('That code did not include a lineup.')
  }
  return data
}
