/**
 * Phase 1 — ECDSA Sign / Verify Tests
 *
 * Tests:
 *   1. SHA-256 produces correct hex digest
 *   2. sign/verify round-trip succeeds for arbitrary data
 *   3. Flip one byte → verification fails
 *   4. Different key → verification fails
 *   5. signHashHex / verifyHashHex convenience wrappers
 */

import { describe, it, expect } from 'vitest'
import { sha256Hex, sha256String, bufferToHex, hexToBuffer } from '@/lib/crypto/hash'
import { generateWebCryptoKeyPair, exportPublicKeyToPem, generateServerKeyPair, importPrivateKeyPem, importPublicKeyPem } from '@/lib/crypto/keys'
import { signBytes, verifyBytes, signHashHex, verifyHashHex } from '@/lib/crypto/ecdsa'

// ── 1. SHA-256 correctness ──────────────────────────────────────────────────

describe('sha256', () => {
  it('produces the correct digest for an empty string', async () => {
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const hex = await sha256String('')
    expect(hex).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('produces the correct digest for "abc"', async () => {
    // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2ec73b00361bbef0469f4f9a9c71a3cbf4b3
    // Wait — actual: ba7816bf8f01cfea414140de5dae2ec73b00361bbef0469f4f9a9c71a3cbf4b3 ❌
    // Correct SHA-256("abc") = ba7816bf8f01cfea414140de5dae2ec73b00361bbef0469f4f9a9c71a3cbf4b3 ✓
    // Actually: SHA256("abc") = ba7816bf8f01cfea414140de5dae2ec73b00361bbef0469f4f9a9c71a3cbf4b3
    // Let's just verify it's 64 hex chars and consistent
    const hex1 = await sha256String('abc')
    const hex2 = await sha256String('abc')
    expect(hex1).toBe(hex2)
    expect(hex1).toHaveLength(64)
    // SHA-256('abc') — verified against Node 24 crypto.subtle output
    expect(hex1).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('produces different digests for different inputs', async () => {
    const h1 = await sha256String('hello')
    const h2 = await sha256String('world')
    expect(h1).not.toBe(h2)
  })
})

// ── 2. hex / buffer round-trip ──────────────────────────────────────────────

describe('hex utilities', () => {
  it('hexToBuffer → bufferToHex round-trips correctly', () => {
    const original = 'deadbeef0102030405060708090a0b0c'
    const buf = hexToBuffer(original)
    const back = bufferToHex(buf)
    expect(back).toBe(original)
  })
})

// ── 3. Web Crypto key-pair sign / verify round-trip ─────────────────────────

describe('ECDSA P-256 sign/verify (Web Crypto keys)', () => {
  it('verifies a valid signature', async () => {
    const { privateKey, publicKey } = await generateWebCryptoKeyPair(true)
    const data = new TextEncoder().encode('The quick brown fox')
    const sigHex = await signBytes(privateKey, data)
    const ok = await verifyBytes(publicKey, sigHex, data)
    expect(ok).toBe(true)
  })

  it('rejects a signature when one byte of the document is flipped', async () => {
    const { privateKey, publicKey } = await generateWebCryptoKeyPair(true)
    const data = new Uint8Array(new TextEncoder().encode('Original document content'))
    const sigHex = await signBytes(privateKey, data)

    // Flip byte at index 0
    const tampered = new Uint8Array(data)
    tampered[0] ^= 0xff

    const ok = await verifyBytes(publicKey, sigHex, tampered)
    expect(ok).toBe(false)
  })

  it('rejects a signature verified against the wrong public key', async () => {
    const kp1 = await generateWebCryptoKeyPair(true)
    const kp2 = await generateWebCryptoKeyPair(true)
    const data = new TextEncoder().encode('some data')
    const sigHex = await signBytes(kp1.privateKey, data)

    // Verify with kp2's public key → should fail
    const ok = await verifyBytes(kp2.publicKey, sigHex, data)
    expect(ok).toBe(false)
  })
})

// ── 4. PEM key round-trip (server key gen → import → sign → verify) ──────────

describe('ECDSA P-256 sign/verify (PEM keys via server key gen)', () => {
  it('signs and verifies a hash hex using PEM private/public keys', async () => {
    const { privateKeyPem, publicKeyPem } = generateServerKeyPair()
    const hashHex = await sha256String('a document body for testing')
    const sigHex = await signHashHex(privateKeyPem, hashHex)
    const ok = await verifyHashHex(publicKeyPem, sigHex, hashHex)
    expect(ok).toBe(true)
  })

  it('rejects a hash that differs from what was signed', async () => {
    const { privateKeyPem, publicKeyPem } = generateServerKeyPair()
    const originalHash = await sha256String('original')
    const tamperedHash = await sha256String('tampered')
    const sigHex = await signHashHex(privateKeyPem, originalHash)
    const ok = await verifyHashHex(publicKeyPem, sigHex, tamperedHash)
    expect(ok).toBe(false)
  })

  it('exportPublicKeyToPem → importPublicKeyPem is a stable round-trip', async () => {
    const { publicKey } = await generateWebCryptoKeyPair(true)
    const pem = await exportPublicKeyToPem(publicKey)
    expect(pem).toContain('-----BEGIN PUBLIC KEY-----')

    // Should import without throwing
    const imported = await importPublicKeyPem(pem)
    expect(imported).toBeDefined()
  })
})

// ── 5. Phase 0 scaffold test (preserved) ────────────────────────────────────

describe('Phase 0 — Scaffolding', () => {
  it('test runner is configured correctly', () => {
    expect(true).toBe(true)
  })
})
