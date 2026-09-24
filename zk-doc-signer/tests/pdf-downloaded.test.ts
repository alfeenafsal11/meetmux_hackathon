import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { verifySignedPdf } from '@/lib/pdf/signPdf'
import { prisma } from '@/lib/db'

describe('Live API signed PDF verification', () => {
  it('successfully verifies the PDF returned by POST /api/documents/:id/sign-pdf', async () => {
    const signer = await prisma.signer.findFirst({
      where: { email: 'alice@example.com' },
      orderBy: { createdAt: 'desc' },
    })
    expect(signer).toBeDefined()
    expect(signer?.publicKey).toBeDefined()

    const signedBytes = fs.readFileSync('signed_output.pdf')
    const result = await verifySignedPdf(new Uint8Array(signedBytes), signer!.publicKey)

    expect(result.valid).toBe(true)
    expect(result.byteRangeHashHex).toBeDefined()
  })

  it('fails verification on tampered signed PDF', async () => {
    const signer = await prisma.signer.findFirst({
      where: { email: 'alice@example.com' },
      orderBy: { createdAt: 'desc' },
    })
    const tamperedBytes = fs.readFileSync('signed_output_tampered.pdf')
    const result = await verifySignedPdf(new Uint8Array(tamperedBytes), signer!.publicKey)

    expect(result.valid).toBe(false)
  })
})
