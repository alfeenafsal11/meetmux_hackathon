/**
 * POST /api/audit/_simulate-tamper
 *
 * DEV ONLY — directly mutates one audit log row in the DB to simulate
 * tampering, so the verify-chain endpoint can demonstrate live detection.
 *
 * NOT exposed in production (guarded by NODE_ENV check).
 *
 * Body (JSON):
 *   { docId: string, entryIndex?: number }
 *   entryIndex defaults to 0 (the first entry for the document).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'Not available in production' }, { status: 403 })
  }

  try {
    const body = (await req.json()) as { docId: string; entryIndex?: number }
    if (!body.docId) {
      return NextResponse.json({ ok: false, error: 'docId is required' }, { status: 400 })
    }

    const entries = await prisma.auditEntry.findMany({
      where: { docId: body.docId },
      orderBy: { timestamp: 'asc' },
    })

    if (entries.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No audit entries found for this document' },
        { status: 404 },
      )
    }

    const idx = body.entryIndex ?? 0
    const target = entries[Math.min(idx, entries.length - 1)]

    // Mutate the action field — smallest visible change that breaks the chain
    const originalAction = target.action
    const tamperedAction = originalAction === 'upload' ? 'tampered-upload' : `tampered-${originalAction}`

    await prisma.auditEntry.update({
      where: { id: target.id },
      data: { action: tamperedAction },
    })

    return NextResponse.json({
      ok: true,
      data: {
        message: 'Tamper simulated — run POST /api/audit/verify-chain to detect it',
        mutatedEntryId: target.id,
        originalAction,
        tamperedAction,
        entryIndex: idx,
      },
    })
  } catch (err) {
    console.error('[POST /api/audit/_simulate-tamper]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
