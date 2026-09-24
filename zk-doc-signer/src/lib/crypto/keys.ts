/**
 * keys.ts — ECDSA P-256 key generation and serialisation
 *
 * Server keys: generated via Node's synchronous crypto API and stored as PEM.
 * Client keys: generated in the browser via Web Crypto (non-extractable).
 *              This file only handles the *server-side* half; client key gen
 *              lives in the browser component (Phase 4/5).
 */

import crypto from 'node:crypto'

// ── Server key generation ───────────────────────────────────────────────────

export interface ServerKeyPair {
  privateKeyPem: string
  publicKeyPem: string
}

/**
 * Generate an ECDSA P-256 key pair synchronously (server-side only).
 * The private key is returned as PKCS#8 PEM so it can be stored in env or DB.
 */
export function generateServerKeyPair(): ServerKeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  return { privateKeyPem: privateKey, publicKeyPem: publicKey }
}

/**
 * Import a PEM public key for use with Web Crypto (verify operations).
 * Works in Node 19+ where crypto.subtle is globally available.
 */
export async function importPublicKeyPem(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '')
  const der = Buffer.from(b64, 'base64')
  return globalThis.crypto.subtle.importKey(
    'spki',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  )
}

/**
 * Import a PEM private key for use with Web Crypto (sign operations — server tests only).
 */
export async function importPrivateKeyPem(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const der = Buffer.from(b64, 'base64')
  return globalThis.crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, // non-extractable — mirrors client-side behaviour
    ['sign'],
  )
}

/**
 * Export a CryptoKey (public) to SPKI PEM string.
 * Used when a client-generated public key needs to be stored server-side.
 */
export async function exportPublicKeyToPem(key: CryptoKey): Promise<string> {
  const spki = await globalThis.crypto.subtle.exportKey('spki', key)
  const b64 = Buffer.from(spki).toString('base64')
  const lines = b64.match(/.{1,64}/g)!.join('\n')
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`
}

/**
 * Generate a Web Crypto ECDSA P-256 key pair (both extractable for test use).
 * In production browser code the private key is `extractable: false`.
 */
export async function generateWebCryptoKeyPair(extractable = false) {
  return globalThis.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    extractable,
    ['sign', 'verify'],
  )
}
