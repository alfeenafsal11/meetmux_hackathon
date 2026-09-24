/**
 * challengeStore.ts — In-memory store for interactive Schnorr identification challenges
 *
 * Each challenge:
 *  - is cryptographically random (32 bytes hex)
 *  - is strictly bound to a specific docId (and optional publicKeyPem)
 *  - has a 5-minute TTL
 *  - is single-use (burned immediately upon verification to prevent replay)
 */

import crypto from 'crypto'

export interface ZKChallengeEntry {
  challengeId: string
  challengeNonce: string
  docId: string
  publicKeyPem?: string
  expiresAt: number
  used: boolean
}

// In-memory challenge store (dev / single-instance; attached to globalThis to survive Next.js module boundaries)
const globalForChallenges = globalThis as unknown as {
  _zkChallengeMap?: Map<string, ZKChallengeEntry>
}
const challengeMap: Map<string, ZKChallengeEntry> =
  globalForChallenges._zkChallengeMap ?? new Map<string, ZKChallengeEntry>()
if (process.env.NODE_ENV !== 'production') {
  globalForChallenges._zkChallengeMap = challengeMap
}
const CHALLENGE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Creates and stores a fresh single-use challenge bound to docId.
 */
export function createChallenge(docId: string, publicKeyPem?: string): ZKChallengeEntry {
  const challengeId = 'zkc_' + crypto.randomBytes(16).toString('hex')
  const challengeNonce = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + CHALLENGE_TTL_MS

  const entry: ZKChallengeEntry = {
    challengeId,
    challengeNonce,
    docId,
    publicKeyPem,
    expiresAt,
    used: false,
  }

  challengeMap.set(challengeId, entry)
  return entry
}

/**
 * Retrieves a challenge, checking expiration and use status.
 */
export function getChallenge(challengeId: string): ZKChallengeEntry | null {
  const entry = challengeMap.get(challengeId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    challengeMap.delete(challengeId)
    return null
  }
  return entry
}

/**
 * Consumes and invalidates a challenge, verifying that it matches docId.
 * Returns true if valid and consumed; false otherwise.
 */
export function consumeChallenge(challengeId: string, docId: string): { ok: boolean; entry?: ZKChallengeEntry; error?: string } {
  const entry = challengeMap.get(challengeId)
  if (!entry) {
    return { ok: false, error: 'Challenge not found or expired' }
  }

  if (Date.now() > entry.expiresAt) {
    challengeMap.delete(challengeId)
    return { ok: false, error: 'Challenge has expired' }
  }

  if (entry.used) {
    return { ok: false, error: 'Challenge has already been consumed (replay attempt detected)' }
  }

  if (entry.docId !== docId) {
    return {
      ok: false,
      error: `Challenge is bound to docId "${entry.docId}", cannot be used for "${docId}"`,
    }
  }

  // Burn the challenge immediately
  entry.used = true
  challengeMap.set(challengeId, entry)

  return { ok: true, entry }
}

/**
 * Clean up expired challenges (periodic maintenance helper)
 */
export function pruneExpiredChallenges(): void {
  const now = Date.now()
  for (const [id, entry] of challengeMap.entries()) {
    if (now > entry.expiresAt) {
      challengeMap.delete(id)
    }
  }
}
