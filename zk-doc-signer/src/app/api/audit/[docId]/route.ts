/**
 * GET /api/audit/:docId
 *
 * Returns all audit entries for the document, ordered oldest-first,
 * plus a live chain validity flag.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyChain } from '@/lib/audit/chain'
import { computeMerkleRoot } from '@/lib/audit/merkle'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  try {
    const { docId } = await params

    const doc = await prisma.document.findUnique({ where: { id: docId } })
    if (!doc) {
      return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 })
    }

    const entries = await prisma.auditEntry.findMany({
      where: { docId },
      orderBy: { timestamp: 'asc' },
    })

    const chainResult = await verifyChain(entries)
    const merkleRoot = await computeMerkleRoot(entries.map((e) => e.entryHash))

    return NextResponse.json({
      ok: true,
      data: {
        docId,
        totalEntries: entries.length,
        chainValid: chainResult.valid,
        merkleRoot,
        entries: entries.map((e) => ({
          id: e.id,
          action: e.action,
          signerId: e.signerId,
          signature: e.signature,
          timestamp: e.timestamp,
          prevHash: e.prevHash,
          entryHash: e.entryHash,
        })),
      },
    })
  } catch (err) {
    console.error('[GET /api/audit/:docId]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
