/**
 * POST /api/documents/:id/upload-pdf
 *
 * Accepts a PDF file upload for an existing document record.
 * Updates the document's fileData with the PDF bytes and updates the hash.
 *
 * Body: multipart/form-data  { file: <PDF file> }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sha256Hex } from '@/lib/crypto/hash'
import { appendAuditEntry } from '@/lib/audit/log'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const doc = await prisma.document.findUnique({ where: { id } })
    if (!doc) {
      return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })
    }

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ ok: false, error: 'File must be a PDF' }, { status: 400 })
    }

    const arrayBuf = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuf)
    const sha256Hash = await sha256Hex(bytes)

    await prisma.document.update({
      where: { id },
      data: {
        fileData: Buffer.from(bytes),
        mimeType: 'application/pdf',
        sha256Hash,
        name: file.name || doc.name,
      },
    })

    await appendAuditEntry({ docId: id, action: 'upload' })

    return NextResponse.json({
      ok: true,
      data: {
        documentId: id,
        name: file.name || doc.name,
        sha256Hash,
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
      },
    })
  } catch (err) {
    console.error('[POST /api/documents/:id/upload-pdf]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
