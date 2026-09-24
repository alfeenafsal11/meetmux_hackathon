/**
 * signPdf.ts — Full PDF signing pipeline using pdf-lib
 *
 * Flow:
 *   1. Load the PDF with pdf-lib
 *   2. Embed a fixed-length hex-zero placeholder as a custom metadata stream
 *      so we know exactly where it will appear in the serialised bytes
 *   3. Serialize (PDFDocument.save())
 *   4. Locate the placeholder → derive ByteRange
 *   5. Hash the two byte ranges with SHA-256 (the "content that was signed")
 *   6. Sign with ECDSA P-256
 *   7. Write the signature hex back into the placeholder
 *   8. Return the final signed PDF bytes + verification metadata
 *
 * Known limitation (in README): this is NOT a full PAdES / PDF/A-3 signature.
 * The /Contents+/ByteRange pattern is structurally correct but the embedded
 * signature object is a raw stream rather than a proper CMS/PKCS#7 envelope.
 * An independent PDF reader will not auto-verify it — verification must be
 * done through this application's /api/documents/:id/verify endpoint.
 */

import { PDFDocument, PDFName, PDFString, PDFHexString } from 'pdf-lib'
import {
  PLACEHOLDER_HEX,
  PLACEHOLDER_BYTES,
  SIGNATURE_PLACEHOLDER_HEX_LEN,
  locatePlaceholder,
  extractSignedBytes,
  writeSignatureIntoPlaceholder,
  readSignatureFromPdf,
  ByteRange,
} from './byteRange'
import { sha256Hex, sha256Buffer } from '@/lib/crypto/hash'
import { signBytes, verifyBytes } from '@/lib/crypto/ecdsa'
import { importPublicKeyPem } from '@/lib/crypto/keys'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SignPdfResult {
  signedPdfBytes: Uint8Array
  byteRange: ByteRange
  byteRangeHashHex: string   // SHA-256 of the signed bytes
  signatureHex: string
  publicKeyPem: string
}

export interface VerifyPdfResult {
  valid: boolean
  byteRangeHashHex: string
  reason?: string
}

// ── Prepare ──────────────────────────────────────────────────────────────────

/**
 * Inject the placeholder into a PDF so it can be located after serialisation.
 *
 * We append a custom info entry whose string value IS the placeholder, so
 * pdf-lib will write it verbatim into the output PDF byte stream.
 */
async function injectPlaceholder(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })

  // Embed the placeholder as a raw hex-string in the document's Info dictionary.
  // PDFHexString serialises as <hex...> which is exactly our marker.
  const info = doc.context.obj({
    ZkSigContents: PDFHexString.of(Buffer.from(PLACEHOLDER_HEX, 'ascii').toString('ascii')),
    ZkSigVersion: PDFString.of('1'),
  })
  doc.catalog.set(PDFName.of('ZkSigInfo'), doc.context.register(info))

  return doc.save({ useObjectStreams: false })
}

// ── Sign ─────────────────────────────────────────────────────────────────────

/**
 * Sign a PDF with an ECDSA P-256 private key (CryptoKey, non-extractable OK).
 *
 * @param pdfBytes    Raw bytes of the original (unsigned) PDF
 * @param privateKey  ECDSA P-256 private CryptoKey
 * @param publicKeyPem  SPKI PEM of the matching public key (stored for verification)
 */
export async function signPdf(
  pdfBytes: Uint8Array,
  privateKey: CryptoKey,
  publicKeyPem: string,
): Promise<SignPdfResult> {
  // 1. Inject placeholder
  const withPlaceholder = await injectPlaceholder(pdfBytes)

  // 2. Locate placeholder → ByteRange
  const byteRange = locatePlaceholder(withPlaceholder)

  // 3. Extract the bytes to be signed
  const signedBytes = extractSignedBytes(withPlaceholder, byteRange)

  // 4. Hash
  const byteRangeHashHex = await sha256Hex(signedBytes)

  // 5. Sign the hash bytes (consistent with our ECDSA helpers: sign over hash hex decoded)
  const hashBuf = await sha256Buffer(signedBytes)
  const signatureHex = await signBytes(privateKey, new Uint8Array(hashBuf))

  // 6. Write signature back into placeholder
  const signedPdfBytes = writeSignatureIntoPlaceholder(withPlaceholder, byteRange, signatureHex)

  return { signedPdfBytes, byteRange, byteRangeHashHex, signatureHex, publicKeyPem }
}

// ── Verify ───────────────────────────────────────────────────────────────────

/**
 * Verify the ECDSA signature embedded in a signed PDF.
 *
 * The signed PDF is expected to have been produced by signPdf().
 * We:
 *  1. Locate the placeholder region (now filled with the signature)
 *  2. Re-extract the byte ranges (same as during signing)
 *  3. Re-hash them
 *  4. Verify the signature against the hash
 */
export async function verifySignedPdf(
  signedPdfBytes: Uint8Array,
  publicKeyPem: string,
): Promise<VerifyPdfResult> {
  // Locate the signature field by its fixed structure: '<' + SIGNATURE_PLACEHOLDER_HEX_LEN hex chars + '>'
  // This works regardless of whether the field contains zeros or the real signature.
  const fieldLen = 1 + SIGNATURE_PLACEHOLDER_HEX_LEN + 1  // '<' + hex + '>'
  let fieldOffset = -1

  outer: for (let i = 0; i <= signedPdfBytes.length - fieldLen; i++) {
    if (signedPdfBytes[i] !== 0x3c) continue  // '<'
    if (signedPdfBytes[i + fieldLen - 1] !== 0x3e) continue  // '>'
    // Check all middle bytes are valid hex chars (0-9, a-f, A-F, or 0x30 for '0')
    for (let j = 1; j < fieldLen - 1; j++) {
      const c = signedPdfBytes[i + j]
      const isHex = (c >= 0x30 && c <= 0x39) ||  // 0-9
                    (c >= 0x61 && c <= 0x66) ||   // a-f
                    (c >= 0x41 && c <= 0x46)       // A-F
      if (!isHex) continue outer
    }
    fieldOffset = i
    break
  }

  if (fieldOffset === -1) {
    return { valid: false, byteRangeHashHex: '', reason: 'Could not locate signature field in PDF' }
  }

  // Reconstruct ByteRange from field offset
  const byteRange: ByteRange = {
    offset1: 0,
    length1: fieldOffset,
    offset2: fieldOffset + fieldLen,
    length2: signedPdfBytes.length - (fieldOffset + fieldLen),
  }

  // Read the signature hex from inside the field using readSignatureFromPdf
  const signatureHex = readSignatureFromPdf(signedPdfBytes, byteRange)

  if (!signatureHex || signatureHex.length < 64) {
    return { valid: false, byteRangeHashHex: '', reason: 'No signature found in PDF (field empty or too short)' }
  }

  // Reconstruct what was signed: replace the field with all-zero placeholder, then extract ranges
  const forVerification = new Uint8Array(signedPdfBytes)
  const zeroField = Buffer.from('<' + '0'.repeat(SIGNATURE_PLACEHOLDER_HEX_LEN) + '>', 'ascii')
  for (let i = 0; i < zeroField.length; i++) {
    forVerification[fieldOffset + i] = zeroField[i]
  }

  const signedBytes = extractSignedBytes(forVerification, byteRange)
  const byteRangeHashHex = await sha256Hex(signedBytes)

  // signPdf signed SHA-256(signedBytes) — verify with the same double-hash
  const hashBuf = await sha256Buffer(signedBytes)

  try {
    const pubKey = await importPublicKeyPem(publicKeyPem)
    const valid = await verifyBytes(pubKey, signatureHex, new Uint8Array(hashBuf))
    return { valid, byteRangeHashHex }
  } catch (e) {
    return {
      valid: false,
      byteRangeHashHex,
      reason: `Verification error: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

