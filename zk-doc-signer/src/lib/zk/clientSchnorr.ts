/**
 * clientSchnorr.ts — Pure client-side Schnorr identification math for browsers
 *
 * Runs 100% in the browser (zero Node.js dependencies).
 * The user's private key NEVER leaves the client device.
 *
 * Uses:
 *  - @noble/curves/p256 for elliptic curve operations
 *  - @noble/hashes/sha256 for cryptographic hashing
 */

import { p256 } from '@noble/curves/p256'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/curves/abstract/utils'

export const CURVE_ORDER: bigint = p256.CURVE.n
export const G = p256.ProjectivePoint.BASE

/**
 * Extracts the 32-byte private scalar x from JWK, raw hex, or PKCS#8 PEM in the browser.
 */
export function clientExtractPrivateScalar(privateKeyInput: string): bigint {
  const trimmed = privateKeyInput.trim()

  // 1. JSON / JWK
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.d) {
        // Base64URL to bytes
        const base64 = parsed.d.replace(/-/g, '+').replace(/_/g, '/')
        const binStr = atob(base64)
        const hex = Array.from(binStr)
          .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('')
        return BigInt('0x' + hex) % CURVE_ORDER
      }
    } catch {
      // not JSON, continue
    }
  }

  // 2. PKCS#8 PEM
  if (trimmed.includes('-----BEGIN PRIVATE KEY-----')) {
    const b64 = trimmed
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\s+/g, '')
    const binStr = atob(b64)
    const bytes = new Uint8Array(Array.from(binStr, (c) => c.charCodeAt(0)))

    // In P-256 PKCS#8 DER, the 32-byte private key octet string starts around offset 36..39:
    // Pattern: 0x04 0x20 [32 bytes of scalar]
    for (let i = 0; i <= bytes.length - 34; i++) {
      if (bytes[i] === 0x04 && bytes[i + 1] === 0x20) {
        const slice = bytes.subarray(i + 2, i + 34)
        const hex = bytesToHex(slice)
        return BigInt('0x' + hex) % CURVE_ORDER
      }
    }
  }

  // 3. Raw hex string
  const cleanHex = trimmed.replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '')
  if (cleanHex.length === 64) {
    return BigInt('0x' + cleanHex) % CURVE_ORDER
  }

  throw new Error('Unsupported private key format. Provide PKCS#8 PEM, JWK, or 64-character hex.')
}

/**
 * Extracts 65-byte uncompressed hex ('04...') from SPKI PEM or raw hex in the browser.
 */
export function clientExtractPublicKeyHex(publicKeyInput: string): string {
  const trimmed = publicKeyInput.trim()
  if (trimmed.includes('-----BEGIN PUBLIC KEY-----')) {
    const b64 = trimmed
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s+/g, '')
    const binStr = atob(b64)
    const bytes = new Uint8Array(Array.from(binStr, (c) => c.charCodeAt(0)))
    // Last 65 bytes of SPKI DER are 04 || X || Y
    if (bytes.length >= 65) {
      return bytesToHex(bytes.subarray(bytes.length - 65))
    }
  }
  return trimmed.replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '')
}

/**
 * Derives the challenge scalar e mod n using Noble sha256 in the browser.
 */
export function clientDeriveChallengeScalar(
  challengeNonce: string,
  docId: string,
  publicKeyHex: string,
  commitmentHex: string,
): bigint {
  const preimage = `${challengeNonce}|${docId}|${publicKeyHex.toLowerCase()}|${commitmentHex.toLowerCase()}`
  const hashBytes = sha256(new TextEncoder().encode(preimage))
  const digest = bytesToHex(hashBytes)
  const scalar = BigInt('0x' + digest) % CURVE_ORDER
  return scalar === 0n ? 1n : scalar
}

/**
 * Generates an Interactive Schnorr identification proof strictly in the browser.
 * Returns { commitmentHex, responseHex } to submit to /api/zk/verify.
 *
 * The private key stays inside this function and is never sent over any network.
 */
export function generateClientSchnorrProof(
  privateKeyInput: string,
  publicKeyInput: string,
  challengeNonce: string,
  docId: string,
): { commitmentHex: string; responseHex: string } {
  // 1. Private scalar x
  const x = clientExtractPrivateScalar(privateKeyInput)

  // 2. Sample ephemeral random k in [1, n-1]
  const randBytes = new Uint8Array(32)
  crypto.getRandomValues(randBytes)
  let k = BigInt('0x' + bytesToHex(randBytes)) % CURVE_ORDER
  if (k === 0n) k = 1n

  // 3. Compute commitment point R = k * G
  const R = G.multiply(k)
  const commitmentHex = R.toHex(false) // 65-byte uncompressed hex

  // 4. Derive challenge scalar e
  const pubHex = clientExtractPublicKeyHex(publicKeyInput)
  const e = clientDeriveChallengeScalar(challengeNonce, docId, pubHex, commitmentHex)

  // 5. Compute response s = (k + e * x) mod n
  const s = (k + ((e * x) % CURVE_ORDER)) % CURVE_ORDER
  const responseHex = s.toString(16).padStart(64, '0')

  return { commitmentHex, responseHex }
}
