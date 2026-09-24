/**
 * POST /api/documents/:id/sign-pdf
 * GET  /api/documents/:id/sign-pdf
 *
 * Two-step flow:
 *   1. GET  → server injects placeholder, stores prepared PDF in memory cache,
 *             returns byteRange + byteRangeHashHex for client to sign
 *   2. POST → client submits signatureHex + byteRangeHashHex; server loads
 *             the *same* prepared bytes from cache (not re-injected), verifies,
 *             writes signature into placeholder, stores signed PDF
 *
 * The cache is keyed by docId and expires after 10 minutes (enough for one signing session).
 * In production this would be a Redis entry or a DB column storing the prepared bytes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { appendAuditEntry } from '@/lib/audit/log'
import { sha256Hex, sha256Buffer } from '@/lib/crypto/hash'
import {
  locatePlaceholder,
  extractSignedBytes,
  writeSignatureIntoPlaceholder,
  PLACEHOLDER_HEX,
} from '@/lib/pdf/byteRange'
import { importPublicKeyPem } from '@/lib/crypto/keys'
import { verifyBytes } from '@/lib/crypto/ecdsa'
import { PDFDocument, PDFName, PDFHexString, PDFString } from 'pdf-lib'
import { validateSignerTurn, checkAllSigned } from '@/lib/multiParty/signerQueue'

// ── Prepared PDF cache (module-level, survives HMR in dev) ──────────────────

interface CacheEntry {
  preparedBytes: Uint8Array
  expiresAt: number
}
const preparedCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 10 * 60 * 1000   // 10 minutes

function cacheGet(docId: string): Uint8Array | null {
  const entry = preparedCache.get(docId)
  if (!entry || Date.now() > entry.expiresAt) { preparedCache.delete(docId); return null }
  return entry.preparedBytes
}
function cacheSet(docId: string, bytes: Uint8Array) {
  preparedCache.set(docId, { preparedBytes: bytes, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ── Placeholder injection ───────────────────────────────────────────────────

async function injectPlaceholder(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const info = doc.context.obj({
    ZkSigContents: PDFHexString.of(Buffer.from(PLACEHOLDER_HEX, 'ascii').toString('ascii')),
    ZkSigVersion: PDFString.of('1'),
  })
  doc.catalog.set(PDFName.of('ZkSigInfo'), doc.context.register(info))
  return doc.save({ useObjectStreams: false })
}

// ── GET — prepare PDF ───────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const doc = await prisma.document.findUnique({ where: { id } })
    if (!doc || !doc.fileData) {
      return NextResponse.json({ ok: false, error: 'Document or PDF not found' }, { status: 404 })
    }

    const pdfBytes = new Uint8Array(doc.fileData)
    const withPlaceholder = await injectPlaceholder(pdfBytes)

    // Cache the prepared bytes so POST uses exactly the same bytes
    cacheSet(id, withPlaceholder)

    const byteRange = locatePlaceholder(withPlaceholder)
    const signedBytes = extractSignedBytes(withPlaceholder, byteRange)
    const byteRangeHashHex = await sha256Hex(signedBytes)

    return NextResponse.json({
      ok: true,
      data: {
        documentId: id,
        byteRange,
        byteRangeHashHex,
        preparedPdfBase64: Buffer.from(withPlaceholder).toString('base64'),
      },
    })
  } catch (err) {
    console.error('[GET /api/documents/:id/sign-pdf]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST — verify + write signature ────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json() as {
      signerName: string
      signerEmail: string
      publicKeyPem: string
      signatureHex: string
      byteRangeHashHex: string
    }

    const { signerName, signerEmail, publicKeyPem, signatureHex, byteRangeHashHex } = body
    if (!signerName || !signerEmail || !publicKeyPem || !signatureHex || !byteRangeHashHex) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
    }

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
    if (!doc.fileData) {
      return NextResponse.json(
        { ok: false, error: 'No PDF uploaded for this document — call upload-pdf first' },
        { status: 400 },
      )
    }

    // Multi-party queue validation
    const turnValidation = validateSignerTurn(doc.signingMode, doc.signers, {
      signerEmail,
    })
    if (!turnValidation.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: turnValidation.error,
          currentSigner: turnValidation.currentSigner
            ? {
                id: turnValidation.currentSigner.id,
                name: turnValidation.currentSigner.name,
                order: turnValidation.currentSigner.order,
              }
            : null,
        },
        { status: 403 },
      )
    }

    // Load prepared bytes from cache; if expired, re-inject and re-cache
    let withPlaceholder = cacheGet(id)
    if (!withPlaceholder) {
      withPlaceholder = await injectPlaceholder(new Uint8Array(doc.fileData))
      cacheSet(id, withPlaceholder)
    }

    // Server re-derives the byte-range hash from the prepared bytes
    const byteRange = locatePlaceholder(withPlaceholder)
    const signedBytes = extractSignedBytes(withPlaceholder, byteRange)
    const serverByteRangeHash = await sha256Hex(signedBytes)

    if (serverByteRangeHash !== byteRangeHashHex.toLowerCase()) {
      return NextResponse.json(
        {
          ok: false,
          error: 'byteRangeHashHex mismatch — call GET first to get the current hash, then sign and POST',
          serverHash: serverByteRangeHash,
        },
        { status: 422 },
      )
    }

    // Verify ECDSA sig over SHA-256(signedBytes)
    const hashBuf = await sha256Buffer(signedBytes)
    let valid: boolean
    try {
      const pubKey = await importPublicKeyPem(publicKeyPem)
      valid = await verifyBytes(pubKey, signatureHex, new Uint8Array(hashBuf))
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Signature verification failed — invalid key or signature format' },
        { status: 400 },
      )
    }
    if (!valid) {
      return NextResponse.json(
        { ok: false, error: 'Signature is invalid for the byte-range hash' },
        { status: 422 },
      )
    }

    // Write signature into placeholder → store signed PDF
    const signedPdfBytes = writeSignatureIntoPlaceholder(withPlaceholder, byteRange, signatureHex)
    const signedHash = await sha256Hex(signedPdfBytes)

    await prisma.document.update({
      where: { id },
      data: { fileData: Buffer.from(signedPdfBytes), sha256Hash: signedHash },
    })

    // Update or create signer record
    let signerId: string
    const now = new Date()
    if (turnValidation.matchedSigner) {
      const updated = await prisma.signer.update({
        where: { id: turnValidation.matchedSigner.id },
        data: {
          name: signerName || turnValidation.matchedSigner.name,
          publicKey: publicKeyPem,
          signature: signatureHex,
          signedAt: now,
          status: 'signed',
        },
      })
      signerId = updated.id
    } else {
      const created = await prisma.signer.create({
        data: {
          documentId: id,
          name: signerName,
          email: signerEmail,
          publicKey: publicKeyPem,
          signature: signatureHex,
          signedAt: now,
          status: 'signed',
        },
      })
      signerId = created.id
    }

    await appendAuditEntry({ docId: id, signerId, action: 'sign', signature: signatureHex })

    // Check if document is now complete
    const allDocSigners = await prisma.signer.findMany({
      where: { documentId: id },
    })
    const allSigned = checkAllSigned(allDocSigners)
    if (allSigned && doc.status !== 'completed') {
      await prisma.document.update({
        where: { id },
        data: { status: 'completed' },
      })
    }

    // Evict cache (PDF has changed)
    preparedCache.delete(id)

    return new NextResponse(signedPdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="signed-${doc.name}.pdf"`,
        'X-Signer-Id': signerId,
        'X-ByteRange-Hash': byteRangeHashHex,
        'X-Signature': signatureHex.slice(0, 32) + '...',
        'X-Document-Status': allSigned ? 'completed' : 'pending',
      },
    })
  } catch (err) {
    console.error('[POST /api/documents/:id/sign-pdf]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
