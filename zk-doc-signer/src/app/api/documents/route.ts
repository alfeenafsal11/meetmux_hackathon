/**
 * POST /api/documents
 *
 * Accepts a multipart/form-data upload with:
 *   - file: the document binary
 *   - name: (optional) display name
 *
 * Stores the document (as raw bytes) + its SHA-256 hash in the DB.
 * Returns { ok: true, data: { id, name, sha256Hash } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sha256Hex } from '@/lib/crypto/hash'
import { appendAuditEntry } from '@/lib/audit/log'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const name = (formData.get('name') as string | null) ?? file?.name ?? 'untitled'

    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })
    }

    const arrayBuf = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuf)
    const sha256Hash = await sha256Hex(bytes)

    const signingModeRaw = formData.get('signingMode') as string | null
    const signingMode = signingModeRaw === 'sequential' ? 'sequential' : 'parallel'

    let signersData: Array<{ name: string; email: string; order?: number; publicKey?: string }> = []
    const signersRaw = formData.get('signers') as string | null
    if (signersRaw) {
      try {
        const parsed = JSON.parse(signersRaw)
        if (Array.isArray(parsed)) {
          signersData = parsed
        }
      } catch {
        // ignore invalid JSON, proceed with empty signers
      }
    }

    const doc = await prisma.document.create({
      data: {
        name,
        sha256Hash,
        fileData: Buffer.from(bytes),
        mimeType: file.type || 'application/octet-stream',
        signingMode,
        status: 'pending',
        signers: {
          create: signersData.map((s, idx) => ({
            name: s.name,
            email: s.email,
            order: s.order ?? idx + 1,
            publicKey: s.publicKey ?? '',
            status: 'pending',
          })),
        },
      },
      include: {
        signers: true,
      },
    })

    // Write audit log entry for the upload action
    await appendAuditEntry({ docId: doc.id, action: 'upload' })

    return NextResponse.json({
      ok: true,
      data: {
        id: doc.id,
        name: doc.name,
        sha256Hash: doc.sha256Hash,
        mimeType: doc.mimeType,
        signingMode: doc.signingMode,
        status: doc.status,
        signers: doc.signers,
        createdAt: doc.createdAt,
      },
    })
  } catch (err) {
    console.error('[POST /api/documents]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const docs = await prisma.document.findMany({
      select: {
        id: true,
        name: true,
        sha256Hash: true,
        mimeType: true,
        signingMode: true,
        status: true,
        createdAt: true,
        signers: {
          select: { id: true, name: true, email: true, order: true, status: true, signedAt: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ ok: true, data: docs })
  } catch (err) {
    console.error('[GET /api/documents]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
