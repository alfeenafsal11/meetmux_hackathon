/**
 * POST /api/zk/prove (DEV-ONLY TEST HARNESS)
 *
 * NOTE ON ZERO-KNOWLEDGE INTEGRITY:
 * In a true zero-knowledge workflow, the signer's private key NEVER leaves the
 * user's browser. The actual signing UI (ZKProveModal.tsx) computes R and s
 * entirely client-side using clientSchnorr.ts and transmits only (R, s) to /zk/verify.
 *
 * This endpoint is strictly a dev-only testing harness for automated scripts.
 * It is disabled in production environments.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getChallenge } from '@/lib/zk/challengeStore'
import { generateProof } from '@/lib/zk/schnorrIdent'

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Forbidden: /api/zk/prove is a dev-only test harness. Production proofs must be generated client-side to preserve zero-knowledge.',
      },
      { status: 403 },
    )
  }

  try {
    const body = await req.json()
    const { privateKeyPem, publicKeyPem, challengeId, docId } = body as {
      privateKeyPem: string
      publicKeyPem: string
      challengeId: string
      docId: string
    }

    if (!privateKeyPem || !publicKeyPem || !challengeId || !docId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: privateKeyPem, publicKeyPem, challengeId, docId' },
        { status: 400 },
      )
    }

    const challenge = getChallenge(challengeId)
    if (!challenge) {
      return NextResponse.json(
        { ok: false, error: 'Challenge not found or expired' },
        { status: 404 },
      )
    }

    if (challenge.docId !== docId) {
      return NextResponse.json(
        { ok: false, error: 'Challenge docId mismatch' },
        { status: 400 },
      )
    }

    const proof = generateProof(
      privateKeyPem,
      publicKeyPem,
      challengeId,
      challenge.challengeNonce,
      docId,
    )

    return NextResponse.json({
      ok: true,
      data: {
        commitmentHex: proof.commitmentHex,
        responseHex: proof.responseHex,
        challengeId: proof.challengeId,
        docId: proof.docId,
      },
    })
  } catch (err: unknown) {
    console.error('[POST /api/zk/prove]', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
