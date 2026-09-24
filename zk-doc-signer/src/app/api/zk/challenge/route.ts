/**
 * POST /api/zk/challenge
 *
 * Move 2 of the Interactive Schnorr Identification Protocol:
 * Server generates and stores a random challenge nonce bound to a docId.
 *
 * Body:
 *   {
 *     docId: string,
 *     publicKeyPem?: string
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createChallenge } from '@/lib/zk/challengeStore'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { docId, publicKeyPem } = body as { docId: string; publicKeyPem?: string }

    if (!docId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required field: docId' },
        { status: 400 },
      )
    }

    const doc = await prisma.document.findUnique({ where: { id: docId } })
    if (!doc) {
      return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 })
    }

    const challenge = createChallenge(docId, publicKeyPem)

    return NextResponse.json({
      ok: true,
      data: {
        challengeId: challenge.challengeId,
        challengeNonce: challenge.challengeNonce,
        docId: challenge.docId,
        expiresAt: challenge.expiresAt,
      },
    })
  } catch (err) {
    console.error('[POST /api/zk/challenge]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
