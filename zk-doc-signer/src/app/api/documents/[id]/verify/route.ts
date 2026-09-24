/**
 * POST /api/documents/:id/verify
 *
 * Body (JSON):
 *   {
 *     signerId?: string,       // verify a specific signer
 *     publicKeyPem?: string,   // if provided, re-verify with this key
 *     fileHash?: string,       // hex SHA-256 of a re-uploaded file for tamper check
 *   }
 *
 * Returns per-signer verification status plus an optional file-hash mismatch flag.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyHashHex } from '@/lib/crypto/ecdsa'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = (await req.json()) as {
      signerId?: string
      publicKeyPem?: string
      fileHash?: string
    }

    const doc = await prisma.document.findUnique({
      where: { id },
      include: { signers: true },
    })

    if (!doc) {
      return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 })
    }

    // Optional: check if a re-uploaded file still matches the stored hash
    let fileHashMatch: boolean | null = null
    if (body.fileHash) {
      fileHashMatch = body.fileHash.toLowerCase() === doc.sha256Hash.toLowerCase()
    }

    // Verify all (or a specific) signer's signature
    const signersToCheck = body.signerId
      ? doc.signers.filter((s) => s.id === body.signerId)
      : doc.signers

    const results = await Promise.all(
      signersToCheck.map(async (signer) => {
        if (!signer.signature) {
          return { signerId: signer.id, name: signer.name, email: signer.email, valid: false, reason: 'No signature on record' }
        }
        const pubKey = body.publicKeyPem ?? signer.publicKey
        try {
          const valid = await verifyHashHex(pubKey, signer.signature, doc.sha256Hash)
          return { signerId: signer.id, name: signer.name, email: signer.email, valid }
        } catch {
          return { signerId: signer.id, name: signer.name, email: signer.email, valid: false, reason: 'Verification error' }
        }
      }),
    )

    const allValid = results.length > 0 && results.every((r) => r.valid)

    return NextResponse.json({
      ok: true,
      data: {
        documentId: id,
        documentName: doc.name,
        sha256Hash: doc.sha256Hash,
        fileHashMatch,
        allSignaturesValid: allValid,
        signers: results,
      },
    })
  } catch (err) {
    console.error('[POST /api/documents/:id/verify]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
