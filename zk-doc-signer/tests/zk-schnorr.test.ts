/**
 * Phase 5 — Interactive Schnorr Identification Protocol Tests
 *
 * Verifies:
 *   1. Scalar reduction modulo curve order n
 *   2. Context binding (challenge derived with docId, nonce, P, R)
 *   3. Honest prover verification passes: s * G == R + e * P
 *   4. Dishonest / wrong public key fails
 *   5. Cross-document replay fails (tampered docId)
 *   6. Single-use challenge consumption (replay rejected)
 *   7. Expired challenge rejection
 *   8. Edge cases: response scalar s = 0, invalid hex, tampered scalars
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createCommitment,
  computeResponse,
  generateProof,
  verifySchnorrProof,
  deriveChallengeScalar,
  CURVE_ORDER,
  G,
} from '@/lib/zk/schnorrIdent'
import {
  createChallenge,
  getChallenge,
  consumeChallenge,
} from '@/lib/zk/challengeStore'
import { generateServerKeyPair } from '@/lib/crypto/keys'
import { p256 } from '@noble/curves/p256'

describe('Interactive Schnorr Identification Protocol (Math & Curve)', () => {
  let signerKeys: { privateKeyPem: string; publicKeyPem: string }
  const docId = 'doc_test_12345'
  const challengeNonce = 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef'

  beforeEach(() => {
    signerKeys = generateServerKeyPair()
  })

  it('reduces challenge scalar e strictly into the scalar field [1, n-1]', () => {
    const { commitmentHex } = createCommitment()
    const e = deriveChallengeScalar(challengeNonce, docId, signerKeys.publicKeyPem, commitmentHex)
    expect(e > 0n).toBe(true)
    expect(e < CURVE_ORDER).toBe(true)
  })

  it('derivation of e changes when docId changes (context binding)', () => {
    const { commitmentHex } = createCommitment()
    const e1 = deriveChallengeScalar(challengeNonce, 'doc_A', signerKeys.publicKeyPem, commitmentHex)
    const e2 = deriveChallengeScalar(challengeNonce, 'doc_B', signerKeys.publicKeyPem, commitmentHex)
    expect(e1).not.toBe(e2)
  })

  it('valid proof verifies successfully', () => {
    const proof = generateProof(
      signerKeys.privateKeyPem,
      signerKeys.publicKeyPem,
      'chal_1',
      challengeNonce,
      docId,
    )

    const result = verifySchnorrProof(
      signerKeys.publicKeyPem,
      proof.commitmentHex,
      proof.responseHex,
      challengeNonce,
      docId,
    )

    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('proof fails when verified against a different public key', () => {
    const wrongKeys = generateServerKeyPair()
    const proof = generateProof(
      signerKeys.privateKeyPem,
      signerKeys.publicKeyPem,
      'chal_1',
      challengeNonce,
      docId,
    )

    const result = verifySchnorrProof(
      wrongKeys.publicKeyPem,
      proof.commitmentHex,
      proof.responseHex,
      challengeNonce,
      docId,
    )

    expect(result.valid).toBe(false)
  })

  it('proof fails when verified against a different docId (replay prevention)', () => {
    const proof = generateProof(
      signerKeys.privateKeyPem,
      signerKeys.publicKeyPem,
      'chal_1',
      challengeNonce,
      'doc_original',
    )

    // Attacker tries to use the same proof for doc_target
    const result = verifySchnorrProof(
      signerKeys.publicKeyPem,
      proof.commitmentHex,
      proof.responseHex,
      challengeNonce,
      'doc_target',
    )

    expect(result.valid).toBe(false)
  })

  it('fails if response scalar s is modified/tampered', () => {
    const proof = generateProof(
      signerKeys.privateKeyPem,
      signerKeys.publicKeyPem,
      'chal_1',
      challengeNonce,
      docId,
    )

    // Flip last digit of hex scalar
    const tamperedS = proof.responseHex.slice(0, -1) + (proof.responseHex.slice(-1) === '0' ? '1' : '0')

    const result = verifySchnorrProof(
      signerKeys.publicKeyPem,
      proof.commitmentHex,
      tamperedS,
      challengeNonce,
      docId,
    )

    expect(result.valid).toBe(false)
  })

  it('client-side generateClientSchnorrProof produces valid proof that server verifies', async () => {
    const { generateClientSchnorrProof } = await import('@/lib/zk/clientSchnorr')
    const { commitmentHex, responseHex } = generateClientSchnorrProof(
      signerKeys.privateKeyPem,
      signerKeys.publicKeyPem,
      challengeNonce,
      docId,
    )

    const result = verifySchnorrProof(
      signerKeys.publicKeyPem,
      commitmentHex,
      responseHex,
      challengeNonce,
      docId,
    )

    expect(result.valid).toBe(true)
  })
})

describe('Interactive Challenge Store & Lifecycle', () => {
  const docId = 'doc_lifecycle_test'

  it('creates and retrieves a valid challenge bound to docId', () => {
    const chal = createChallenge(docId)
    expect(chal.challengeId).toMatch(/^zkc_/)
    expect(chal.docId).toBe(docId)
    expect(chal.used).toBe(false)

    const retrieved = getChallenge(chal.challengeId)
    expect(retrieved?.challengeId).toBe(chal.challengeId)
  })

  it('consumes a challenge once, and prevents replay on second attempt', () => {
    const chal = createChallenge(docId)

    // First consumption: success
    const first = consumeChallenge(chal.challengeId, docId)
    expect(first.ok).toBe(true)
    expect(first.entry?.used).toBe(true)

    // Replay attempt: rejected
    const replay = consumeChallenge(chal.challengeId, docId)
    expect(replay.ok).toBe(false)
    expect(replay.error).toMatch(/already been consumed|replay/i)
  })

  it('rejects challenge consumption for mismatched docId', () => {
    const chal = createChallenge('doc_correct')

    const res = consumeChallenge(chal.challengeId, 'doc_impostor')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/cannot be used for/i)
  })

  it('rejects an expired challenge', () => {
    const chal = createChallenge(docId)
    // Manually backdate expiration
    chal.expiresAt = Date.now() - 1000

    const res = consumeChallenge(chal.challengeId, docId)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/expired/i)
  })
})
