/**
 * schnorrIdent.ts — Interactive Schnorr Identification Protocol over NIST P-256 (secp256r1)
 *
 * PROTOCOL DESIGN:
 * This implements an INTERACTIVE Schnorr Proof-of-Knowledge identification protocol
 * (3-move Sigma protocol) over the NIST P-256 elliptic curve.
 *
 * 1. Setup:
 *    Prover has key pair (x, P) where x is the private scalar and P = x * G is the public key.
 * 2. Move 1 (Commitment):
 *    Prover chooses random k in [1, n-1] and computes R = k * G.
 * 3. Move 2 (Challenge):
 *    Server issues a fresh random nonce 'c'.
 *    The effective challenge scalar 'e' is derived by hashing the challenge nonce,
 *    document ID context, public key P, and commitment R:
 *      e = SHA-256(challengeNonce || docId || P_hex || R_hex) mod n
 *    This strictly binds the proof to the specific document context and challenge,
 *    preventing cross-document replay attacks.
 * 4. Move 3 (Response):
 *    Prover computes s = (k + e * x) mod n and sends (R, s) to the Verifier.
 * 5. Verification:
 *    Verifier checks that:
 *      s * G == R + e * P
 *
 * All scalar operations are performed strictly modulo the P-256 curve order n.
 */

import { p256 } from '@noble/curves/p256'
import crypto from 'crypto'

export const CURVE_ORDER: bigint = p256.CURVE.n
export const G = p256.ProjectivePoint.BASE

export interface SchnorrCommitment {
  k: bigint
  commitmentHex: string // uncompressed hex point (04...)
}

export interface SchnorrProof {
  commitmentHex: string
  responseHex: string
  challengeId: string
  docId: string
  publicKeyPem: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts uncompressed 65-byte hex point ('04...') from SPKI PEM or returns raw hex.
 */
export function extractPublicKeyHex(publicKeyInput: string): string {
  const trimmed = publicKeyInput.trim()
  if (trimmed.startsWith('-----BEGIN PUBLIC KEY-----')) {
    const der = crypto.createPublicKey(trimmed).export({ type: 'spki', format: 'der' })
    return Buffer.from(der.subarray(der.length - 65)).toString('hex')
  }
  // Remove 0x prefix if present
  return trimmed.replace(/^0x/i, '')
}

/**
 * Extracts private scalar x (mod n) from PKCS#8 PEM or raw hex/JWK.
 */
export function extractPrivateScalar(privateKeyInput: string): bigint {
  const trimmed = privateKeyInput.trim()
  if (trimmed.startsWith('-----BEGIN PRIVATE KEY-----')) {
    const jwk = crypto.createPrivateKey(trimmed).export({ format: 'jwk' })
    if (!jwk.d) throw new Error('JWK export missing private key scalar d')
    const scalarBuf = Buffer.from(jwk.d, 'base64url')
    return BigInt('0x' + scalarBuf.toString('hex')) % CURVE_ORDER
  }
  const cleanHex = trimmed.replace(/^0x/i, '')
  return BigInt('0x' + cleanHex) % CURVE_ORDER
}

/**
 * Derives the challenge scalar e, reduced modulo the P-256 curve order n,
 * bound to the challengeNonce, docId, public key, and commitment point.
 */
export function deriveChallengeScalar(
  challengeNonce: string,
  docId: string,
  publicKeyHex: string,
  commitmentHex: string,
): bigint {
  const preimage = `${challengeNonce}|${docId}|${publicKeyHex.toLowerCase()}|${commitmentHex.toLowerCase()}`
  const digest = crypto.createHash('sha256').update(preimage).digest('hex')
  const scalar = BigInt('0x' + digest) % CURVE_ORDER
  return scalar === 0n ? 1n : scalar
}

// ── Protocol Moves ───────────────────────────────────────────────────────────

/**
 * Move 1: Prover creates an ephemeral commitment R = k * G
 */
export function createCommitment(): SchnorrCommitment {
  let k: bigint
  do {
    const randBytes = crypto.randomBytes(32)
    k = BigInt('0x' + randBytes.toString('hex')) % CURVE_ORDER
  } while (k === 0n)

  const R = G.multiply(k)
  const commitmentHex = R.toHex(false) // 65-byte uncompressed hex ('04...')

  return { k, commitmentHex }
}

/**
 * Move 3: Prover computes response scalar s = (k + e * x) mod n
 */
export function computeResponse(
  privateKeyInput: string,
  k: bigint,
  challengeNonce: string,
  docId: string,
  publicKeyInput: string,
  commitmentHex: string,
): string {
  const x = extractPrivateScalar(privateKeyInput)
  const pubHex = extractPublicKeyHex(publicKeyInput)
  const e = deriveChallengeScalar(challengeNonce, docId, pubHex, commitmentHex)

  const s = (k + ((e * x) % CURVE_ORDER)) % CURVE_ORDER
  // Pad to 64 hex characters (32 bytes)
  return s.toString(16).padStart(64, '0')
}

/**
 * Full prover workflow convenience helper:
 * Creates commitment, derives challenge scalar with server nonce, and computes response.
 */
export function generateProof(
  privateKeyInput: string,
  publicKeyInput: string,
  challengeId: string,
  challengeNonce: string,
  docId: string,
): SchnorrProof {
  const { k, commitmentHex } = createCommitment()
  const responseHex = computeResponse(
    privateKeyInput,
    k,
    challengeNonce,
    docId,
    publicKeyInput,
    commitmentHex,
  )

  return {
    commitmentHex,
    responseHex,
    challengeId,
    docId,
    publicKeyPem: publicKeyInput,
  }
}

/**
 * Verification: Verifier checks if s * G == R + e * P
 *
 * @param publicKeyInput Public key (SPKI PEM or uncompressed hex)
 * @param commitmentHex  Commitment point R (uncompressed hex)
 * @param responseHex    Response scalar s (hex string)
 * @param challengeNonce Server-issued challenge nonce
 * @param docId          Document ID context
 */
export function verifySchnorrProof(
  publicKeyInput: string,
  commitmentHex: string,
  responseHex: string,
  challengeNonce: string,
  docId: string,
): { valid: boolean; error?: string } {
  try {
    const s = BigInt('0x' + responseHex) % CURVE_ORDER
    if (s === 0n) {
      return { valid: false, error: 'Response scalar s cannot be zero' }
    }

    const pubHex = extractPublicKeyHex(publicKeyInput)
    const P = p256.ProjectivePoint.fromHex(pubHex)
    const R = p256.ProjectivePoint.fromHex(commitmentHex)

    // Re-derive challenge scalar e
    const e = deriveChallengeScalar(challengeNonce, docId, pubHex, commitmentHex)

    // LHS = s * G
    const lhs = G.multiply(s)

    // RHS = R + e * P
    const eP = P.multiply(e)
    const rhs = R.add(eP)

    const valid = lhs.equals(rhs)
    return {
      valid,
      error: valid ? undefined : 'Proof verification failed: s * G != R + e * P',
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { valid: false, error: `Invalid proof or curve point format: ${message}` }
  }
}
