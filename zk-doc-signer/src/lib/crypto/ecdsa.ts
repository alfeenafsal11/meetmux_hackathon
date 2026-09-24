/**
 * ecdsa.ts — ECDSA P-256 sign and verify helpers
 *
 * All operations use the Node 24 Web Crypto global (crypto.subtle).
 * Signatures are returned/accepted as hex-encoded DER (IEEE P1363 format
 * is what Web Crypto produces natively; we keep it as-is).
 */

import { bufferToHex, hexToBuffer } from './hash'
import { importPrivateKeyPem, importPublicKeyPem } from './keys'

// ── Sign ───────────────────────────────────────────────────────────────────

/**
 * Sign arbitrary bytes with a CryptoKey (private, ECDSA P-256).
 * Returns the signature as a hex string.
 */
export async function signBytes(
  privateKey: CryptoKey,
  data: Uint8Array,
): Promise<string> {
  const sigBuf = await globalThis.crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    data,
  )
  return bufferToHex(sigBuf)
}

/**
 * Sign a hex-encoded document hash with a PEM private key.
 * Convenience wrapper used by the server-side signing endpoint.
 */
export async function signHashHex(
  privateKeyPem: string,
  hashHex: string,
): Promise<string> {
  const key = await importPrivateKeyPem(privateKeyPem)
  const data = hexToBuffer(hashHex)
  return signBytes(key, data)
}

// ── Verify ─────────────────────────────────────────────────────────────────

/**
 * Verify a signature (hex) against raw bytes with a CryptoKey (public, ECDSA P-256).
 */
export async function verifyBytes(
  publicKey: CryptoKey,
  signatureHex: string,
  data: Uint8Array,
): Promise<boolean> {
  const sigBuf = hexToBuffer(signatureHex)
  return globalThis.crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    sigBuf,
    data,
  )
}

/**
 * Verify a hex signature against a hex document hash using a PEM public key.
 * Convenience wrapper used by the server-side verify endpoint.
 */
export async function verifyHashHex(
  publicKeyPem: string,
  signatureHex: string,
  hashHex: string,
): Promise<boolean> {
  const key = await importPublicKeyPem(publicKeyPem)
  const data = hexToBuffer(hashHex)
  return verifyBytes(key, signatureHex, data)
}
