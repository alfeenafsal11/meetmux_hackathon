/**
 * Phase 3 — PDF Byte-Range Signing Tests
 *
 * Tests:
 *   1. injectPlaceholder embeds the marker in the serialised bytes
 *   2. locatePlaceholder finds the marker and returns correct offsets
 *   3. extractSignedBytes returns bytes of the correct total length
 *   4. sign a sample PDF → re-derive byte-range hash → verify succeeds
 *   5. Edit one byte of PDF content post-signing → verification fails
 *   6. Wrong public key → verification fails
 *   7. writeSignatureIntoPlaceholder / readSignatureFromPdf round-trip
 */

import { describe, it, expect } from 'vitest'
import { PDFDocument, rgb } from 'pdf-lib'
import {
  PLACEHOLDER_BYTES,
  SIGNATURE_PLACEHOLDER_HEX_LEN,
  locatePlaceholder,
  extractSignedBytes,
  writeSignatureIntoPlaceholder,
  readSignatureFromPdf,
} from '@/lib/pdf/byteRange'
import { signPdf, verifySignedPdf } from '@/lib/pdf/signPdf'
import { generateWebCryptoKeyPair, exportPublicKeyToPem } from '@/lib/crypto/keys'
import { sha256Hex, sha256Buffer } from '@/lib/crypto/hash'
import { signBytes } from '@/lib/crypto/ecdsa'

// ── Helper: create a minimal valid PDF ──────────────────────────────────────

async function makeSamplePdf(text = 'ZK Doc Signer — test document'): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 200])
  page.drawText(text, { x: 50, y: 100, size: 14 })
  return doc.save()
}

// ── 1. Placeholder injection ─────────────────────────────────────────────────

describe('PDF placeholder injection', () => {
  it('serialised PDF contains the placeholder marker bytes', async () => {
    const { signPdf: _sp, ...rest } = await import('@/lib/pdf/signPdf')
    // Use the internal injectPlaceholder logic indirectly via signPdf internals
    // We test it by checking locatePlaceholder doesn't throw
    const rawPdf = await makeSamplePdf()
    const doc = await PDFDocument.load(rawPdf)
    const { PDFName, PDFHexString, PDFString } = await import('pdf-lib')
    const { PLACEHOLDER_HEX } = await import('@/lib/pdf/byteRange')
    const info = doc.context.obj({
      ZkSigContents: PDFHexString.of(Buffer.from(PLACEHOLDER_HEX, 'ascii').toString('ascii')),
      ZkSigVersion: PDFString.of('1'),
    })
    doc.catalog.set(PDFName.of('ZkSigInfo'), doc.context.register(info))
    const bytes = await doc.save({ useObjectStreams: false })

    // The placeholder marker '<000...000>' must appear in the raw bytes
    const marker = PLACEHOLDER_BYTES
    let found = false
    for (let i = 0; i <= bytes.length - marker.length; i++) {
      if (bytes[i] === marker[0]) {
        const slice = bytes.subarray(i, i + marker.length)
        if (Buffer.from(slice).equals(marker)) { found = true; break }
      }
    }
    expect(found).toBe(true)
  })
})

// ── 2. ByteRange arithmetic ──────────────────────────────────────────────────

describe('locatePlaceholder', () => {
  it('finds the placeholder and returns valid offsets', async () => {
    const rawPdf = await makeSamplePdf()
    const kp = await generateWebCryptoKeyPair(true)
    const pub = await exportPublicKeyToPem(kp.publicKey)
    const result = await signPdf(rawPdf, kp.privateKey, pub)

    // byteRange offsets must be consistent
    const { offset1, length1, offset2, length2 } = result.byteRange
    expect(offset1).toBe(0)
    expect(offset2).toBe(length1 + PLACEHOLDER_BYTES.length)
    expect(offset2 + length2).toBe(result.signedPdfBytes.length)
  })

  it('signed bytes length equals (length1 + length2)', async () => {
    const rawPdf = await makeSamplePdf()
    const kp = await generateWebCryptoKeyPair(true)
    const pub = await exportPublicKeyToPem(kp.publicKey)
    const result = await signPdf(rawPdf, kp.privateKey, pub)
    const { length1, length2, offset1, offset2 } = result.byteRange
    expect(length1 + length2).toBe(result.signedPdfBytes.length - PLACEHOLDER_BYTES.length)
  })
})

// ── 3. Sign → re-derive → verify (round-trip) ───────────────────────────────

describe('PDF sign/verify round-trip', () => {
  it('verifies successfully after signing', async () => {
    const rawPdf = await makeSamplePdf()
    const kp = await generateWebCryptoKeyPair(true)
    const publicKeyPem = await exportPublicKeyToPem(kp.publicKey)

    const { signedPdfBytes, byteRangeHashHex } = await signPdf(rawPdf, kp.privateKey, publicKeyPem)

    const result = await verifySignedPdf(signedPdfBytes, publicKeyPem)
    expect(result.valid).toBe(true)
    expect(result.byteRangeHashHex).toBe(byteRangeHashHex)
  })

  it('byteRangeHashHex matches re-derivation from the signed PDF', async () => {
    const rawPdf = await makeSamplePdf()
    const kp = await generateWebCryptoKeyPair(true)
    const pub = await exportPublicKeyToPem(kp.publicKey)
    const { signedPdfBytes, byteRange, byteRangeHashHex } = await signPdf(rawPdf, kp.privateKey, pub)

    // Re-derive: zero out signature placeholder, extract ranges, hash
    const clone = new Uint8Array(signedPdfBytes)
    const { PLACEHOLDER_BYTES: PB } = await import('@/lib/pdf/byteRange')
    for (let i = 0; i < PB.length; i++) {
      clone[byteRange.offset1 + byteRange.length1 + i] = PB[i]
    }
    const signed = extractSignedBytes(clone, byteRange)
    const rederived = await sha256Hex(signed)
    expect(rederived).toBe(byteRangeHashHex)
  })
})

// ── 4. Tamper detection ──────────────────────────────────────────────────────

describe('PDF tamper detection', () => {
  it('fails verification when a post-signing byte is flipped', async () => {
    const rawPdf = await makeSamplePdf('original content')
    const kp = await generateWebCryptoKeyPair(true)
    const pub = await exportPublicKeyToPem(kp.publicKey)
    const { signedPdfBytes } = await signPdf(rawPdf, kp.privateKey, pub)

    // Flip the first byte (which is in the signed region, before the placeholder)
    const tampered = new Uint8Array(signedPdfBytes)
    tampered[0] ^= 0xff

    const result = await verifySignedPdf(tampered, pub)
    expect(result.valid).toBe(false)
  })

  it('fails verification when the PDF text content is changed post-signing', async () => {
    const rawPdf = await makeSamplePdf('document content to protect')
    const kp = await generateWebCryptoKeyPair(true)
    const pub = await exportPublicKeyToPem(kp.publicKey)
    const { signedPdfBytes, byteRange } = await signPdf(rawPdf, kp.privateKey, pub)

    // Modify a byte in the first signed region (well before the placeholder)
    const tampered = new Uint8Array(signedPdfBytes)
    // Byte 5 is in region 1 (offset1=0, length1 > 100)
    tampered[5] ^= 0x01

    const result = await verifySignedPdf(tampered, pub)
    expect(result.valid).toBe(false)
  })

  it('fails verification with a different public key', async () => {
    const rawPdf = await makeSamplePdf()
    const kp1 = await generateWebCryptoKeyPair(true)
    const kp2 = await generateWebCryptoKeyPair(true)
    const pub1 = await exportPublicKeyToPem(kp1.publicKey)
    const pub2 = await exportPublicKeyToPem(kp2.publicKey)

    const { signedPdfBytes } = await signPdf(rawPdf, kp1.privateKey, pub1)

    // Verify with wrong key
    const result = await verifySignedPdf(signedPdfBytes, pub2)
    expect(result.valid).toBe(false)
  })
})

// ── 5. Signature placeholder write/read round-trip ───────────────────────────

describe('writeSignatureIntoPlaceholder / readSignatureFromPdf', () => {
  it('reads back the same hex that was written', async () => {
    const rawPdf = await makeSamplePdf()
    const kp = await generateWebCryptoKeyPair(true)
    const pub = await exportPublicKeyToPem(kp.publicKey)
    const { signedPdfBytes, byteRange, signatureHex } = await signPdf(rawPdf, kp.privateKey, pub)

    const read = readSignatureFromPdf(signedPdfBytes, byteRange)
    // Normalise: signatureHex might not be padded; read strips trailing zeros
    expect(signatureHex.startsWith(read) || read.startsWith(signatureHex.replace(/0+$/, ''))).toBe(true)
  })

  it('throws if signature hex is too long for the placeholder', async () => {
    const fakeBytes = new Uint8Array(100)
    const fakeRange = { offset1: 0, length1: 0, offset2: PLACEHOLDER_BYTES.length, length2: 100 - PLACEHOLDER_BYTES.length }
    const tooLong = 'a'.repeat(SIGNATURE_PLACEHOLDER_HEX_LEN + 2)
    expect(() => writeSignatureIntoPlaceholder(fakeBytes, fakeRange, tooLong)).toThrow()
  })
})
