/**
 * POST /api/audit/verify-chain
 *
 * Body (JSON):
 *   { docId: string }     — verify the chain for a single document
 *   {}                    — verify the full global chain (all entries, all docs,
 *                           ordered by timestamp)
 *
 * Returns verification result plus an optional inclusion proof for a specific
 * entry if `entryIndex` is supplied.
 *
 * Body (optional):
 *   { docId?: string, entryIndex?: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyChain } from '@/lib/audit/chain'
import { computeMerkleRoot, generateInclusionProof, verifyInclusionProof } from '@/lib/audit/merkle'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { docId?: string; entryIndex?: number }

    const where = body.docId ? { docId: body.docId } : {}
    const entries = await prisma.auditEntry.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    })

    const chainResult = await verifyChain(entries)
    const leafHashes = entries.map((e) => e.entryHash)
    const merkleRoot = await computeMerkleRoot(leafHashes)

    // Optional: inclusion proof for a specific entry
    let inclusionProof: {
      leafIndex: number
      leafHash: string
      proof: unknown
      root: string
      proofValid: boolean
    } | null = null

    if (typeof body.entryIndex === 'number' && entries.length > 0) {
      const idx = body.entryIndex
      if (idx >= 0 && idx < entries.length) {
        const proof = await generateInclusionProof(leafHashes, idx)
        const proofValid = await verifyInclusionProof(proof)
        inclusionProof = {
          leafIndex: idx,
          leafHash: proof.leafHash,
          proof: proof.proof,
          root: proof.root,
          proofValid,
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        scope: body.docId ? `document:${body.docId}` : 'global',
        totalEntries: entries.length,
        chainValid: chainResult.valid,
        merkleRoot,
        ...(chainResult.firstBadIndex !== undefined && {
          firstBadIndex: chainResult.firstBadIndex,
          firstBadId: chainResult.firstBadId,
          reason: chainResult.reason,
        }),
        inclusionProof,
      },
    })
  } catch (err) {
    console.error('[POST /api/audit/verify-chain]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
