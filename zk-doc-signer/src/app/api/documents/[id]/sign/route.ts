/**
 * POST /api/documents/:id/sign
 *
 * Body (JSON):
 *   {
 *     signerId?: string,      // optional ID of pre-registered signer
 *     signerName: string,
 *     signerEmail: string,
 *     publicKeyPem: string,   // SPKI PEM of the signer's public key
 *     signatureHex: string,   // ECDSA P-256 signature over the doc's SHA-256 hash
 *   }
 *
 * Multi-party flow:
 *  1. Checks if document has registered signers.
 *  2. If sequential mode: verifies it is this signer's turn (rejects out-of-turn with 403).
 *  3. Verifies ECDSA signature over SHA-256 document hash.
 *  4. Marks signer as 'signed', stores signature & signedAt timestamp.
 *  5. Checks if all signers have completed; if so, transitions doc to 'completed'.
 *  6. Writes tamper-evident audit entry.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyHashHex } from '@/lib/crypto/ecdsa'
import { appendAuditEntry } from '@/lib/audit/log'
import {
  validateSignerTurn,
  checkAllSigned,
  getCurrentActiveSigner,
} from '@/lib/multiParty/signerQueue'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { signerId: reqSignerId, signerName, signerEmail, publicKeyPem, signatureHex } = body as {
      signerId?: string
      signerName: string
      signerEmail: string
      publicKeyPem: string
      signatureHex: string
    }

    if (!signerName || !signerEmail || !publicKeyPem || !signatureHex) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: signerName, signerEmail, publicKeyPem, signatureHex' },
        { status: 400 },
      )
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

    // Multi-party queue validation
    const turnValidation = validateSignerTurn(doc.signingMode, doc.signers, {
      signerId: reqSignerId,
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

    // Verify the ECDSA signature against the stored SHA-256 hash
    let valid: boolean
    try {
      valid = await verifyHashHex(publicKeyPem, signatureHex, doc.sha256Hash)
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Signature verification failed — invalid key or signature format' },
        { status: 400 },
      )
    }

    if (!valid) {
      return NextResponse.json(
        { ok: false, error: 'Signature is invalid for this document' },
        { status: 422 },
      )
    }

    // Update existing signer record or create new one (ad-hoc signing)
    let signerRecordId: string
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
      signerRecordId = updated.id
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
      signerRecordId = created.id
    }

    // Write audit log entry for the sign action
    await appendAuditEntry({
      docId: id,
      signerId: signerRecordId,
      action: 'sign',
      signature: signatureHex,
    })

    // Check if document is now complete
    const allDocSigners = await prisma.signer.findMany({
      where: { documentId: id },
      orderBy: { order: 'asc' },
    })

    const allSigned = checkAllSigned(allDocSigners)
    if (allSigned && doc.status !== 'completed') {
      await prisma.document.update({
        where: { id },
        data: { status: 'completed' },
      })
    }

    const nextSigner = getCurrentActiveSigner(doc.signingMode, allDocSigners)

    return NextResponse.json({
      ok: true,
      data: {
        signerId: signerRecordId,
        documentId: id,
        verified: true,
        signedAt: now,
        signingMode: doc.signingMode,
        documentStatus: allSigned ? 'completed' : 'pending',
        allSigned,
        nextSigner: nextSigner
          ? { id: nextSigner.id, name: nextSigner.name, order: nextSigner.order }
          : null,
      },
    })
  } catch (err) {
    console.error('[POST /api/documents/:id/sign]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
