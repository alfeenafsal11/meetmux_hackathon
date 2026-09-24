/**
 * GET /api/documents/:id
 *
 * Fetches a single document by ID, including its signer queue,
 * signingMode, status, and verification summary.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        signers: {
          orderBy: { order: 'asc' },
        },
      },
    })

    if (!doc) {
      return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: doc.id,
        name: doc.name,
        sha256Hash: doc.sha256Hash,
        mimeType: doc.mimeType,
        signingMode: doc.signingMode,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        signers: doc.signers,
      },
    })
  } catch (err) {
    console.error('[GET /api/documents/:id]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
