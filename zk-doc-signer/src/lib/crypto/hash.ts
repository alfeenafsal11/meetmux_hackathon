/**
 * hash.ts — SHA-256 utilities
 *
 * Uses Node's built-in Web Crypto (`globalThis.crypto.subtle`) which is
 * available since Node 19 and fully stable on Node 24 (our pinned runtime).
 */

/**
 * Hash a Buffer/Uint8Array and return the result as a hex string.
 */
export async function sha256Hex(data: Uint8Array | Buffer): Promise<string> {
  const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', data)
  return bufferToHex(hashBuf)
}

/**
 * Hash a Buffer/Uint8Array and return the raw ArrayBuffer.
 */
export async function sha256Buffer(data: Uint8Array | Buffer): Promise<ArrayBuffer> {
  return globalThis.crypto.subtle.digest('SHA-256', data)
}

/**
 * Hash a UTF-8 string and return hex.
 */
export async function sha256String(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text)
  return sha256Hex(encoded)
}

/**
 * Concatenate two hex strings (for chaining: prevHash + payload), hash, return hex.
 */
export async function sha256Chain(prevHex: string, payloadHex: string): Promise<string> {
  const combined = new TextEncoder().encode(prevHex + payloadHex)
  return sha256Hex(combined)
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function bufferToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hexToBuffer(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string length')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}
