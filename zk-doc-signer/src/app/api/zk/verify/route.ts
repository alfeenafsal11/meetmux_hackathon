/**
 * POST /api/zk/verify
 *
 * Verifier step of the Interactive Schnorr Identification Protocol:
 * 1. Looks up and burns the challengeId (preventing replay).
 * 2. Checks that the challenge is bound to docId.
 * 3. Verifies that s * G == R + e * P where e = H(challengeNonce || docId || P || R) mod n.
 *
 * Body:
 *   {
 *     challengeId: string,
 *     docId: string,
 *     publicKeyPem: string,
 *     commitmentHex: string,
 *     responseHex: string
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { consumeChallenge } from '@/lib/zk/challengeStore'
import { verifySchnorrProof } from '@/lib/zk/schnorrIdent'
import { appendAuditEntry } from '@/lib/audit/log'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { challengeId, docId, publicKeyPem, commitmentHex, responseHex } = body as {
      challengeId: string
      docId: string
      publicKeyPem: string
      commitmentHex: string
      responseHex: string
    }

    if (!challengeId || !docId || !publicKeyPem || !commitmentHex || !responseHex) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing required fields: challengeId, docId, publicKeyPem, commitmentHex, responseHex',
        },
        { status: 400 },
      )
    }

    // 1. Consume challenge (atomic check + burn, enforcing single-use and docId binding)
    const consumeResult = consumeChallenge(challengeId, docId)
    if (!consumeResult.ok || !consumeResult.entry) {
      return NextResponse.json(
        { ok: false, error: consumeResult.error || 'Invalid or expired challenge' },
        { status: 400 },
      )
    }

    const { challengeNonce, publicKeyPem: expectedPubKey } = consumeResult.entry

    // If a specific public key was locked to the challenge, verify it matches
    if (expectedPubKey && expectedPubKey.trim() !== publicKeyPem.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Public key does not match the key registered with this challenge' },
        { status: 400 },
      )
    }

    // 2. Mathematically verify Schnorr proof over curve P-256
    const verification = verifySchnorrProof(
      publicKeyPem,
      commitmentHex,
      responseHex,
      challengeNonce,
      docId,
    )

    if (!verification.valid) {
      return NextResponse.json(
        {
          ok: false,
          error: verification.error || 'Schnorr identity proof verification failed',
        },
        { status: 422 },
      )
    }

    // 3. Log audit event
    await appendAuditEntry({
      docId,
      action: 'verify',
    })

    return NextResponse.json({
      ok: true,
      data: {
        verified: true,
        docId,
        challengeId,
        verifiedAt: new Date().toISOString(),
      },
    })
  } catch (err: unknown) {
    console.error('[POST /api/zk/verify]', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
