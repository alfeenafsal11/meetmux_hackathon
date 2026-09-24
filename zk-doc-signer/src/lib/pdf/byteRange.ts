/**
 * byteRange.ts — PDF byte-range utilities
 *
 * Implements the ByteRange pattern used in PDF digital signatures:
 *
 *   /ByteRange [offset1 length1 offset2 length2]
 *
 * where the gap between (offset1+length1) and offset2 is the /Contents
 * placeholder. The signed data is:
 *   pdf[offset1 .. offset1+length1]  +  pdf[offset2 .. offset2+length2]
 *
 * We locate the placeholder by searching for a fixed ASCII marker embedded
 * in the PDF before serialisation.
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Bytes reserved for the hex signature inside /Contents (must be even). */
export const SIGNATURE_PLACEHOLDER_HEX_LEN = 512   // 256 bytes → 512 hex chars
export const CONTENTS_OPEN  = '<'   // PDF hex-string delimiter
export const CONTENTS_CLOSE = '>'

/**
 * The marker string we embed *before* serialisation so we can locate the
 * /Contents field in the raw bytes afterwards.
 *
 * Format (ASCII): <00000...0000>  (SIGNATURE_PLACEHOLDER_HEX_LEN zeros)
 */
export const PLACEHOLDER_HEX = '0'.repeat(SIGNATURE_PLACEHOLDER_HEX_LEN)
export const PLACEHOLDER_BYTES = Buffer.from(
  CONTENTS_OPEN + PLACEHOLDER_HEX + CONTENTS_CLOSE,
  'ascii',
)

// ── ByteRange arithmetic ─────────────────────────────────────────────────────

export interface ByteRange {
  /** Start byte of the first signed region (always 0). */
  offset1: number
  /** Length of the first signed region (up to, not including, the placeholder). */
  length1: number
  /** Start byte of the second signed region (first byte after the placeholder). */
  offset2: number
  /** Length of the second signed region (to end of file). */
  length2: number
}

/**
 * Locate the placeholder in a serialised PDF byte array and return the
 * ByteRange descriptor.  Throws if the placeholder is not found.
 */
export function locatePlaceholder(pdfBytes: Uint8Array): ByteRange {
  const marker = PLACEHOLDER_BYTES

  for (let i = 0; i <= pdfBytes.length - marker.length; i++) {
    let match = true
    for (let j = 0; j < marker.length; j++) {
      if (pdfBytes[i + j] !== marker[j]) { match = false; break }
    }
    if (match) {
      // offset1 = 0, length1 = i (up to, not including, '<')
      // offset2 = i + marker.length, length2 = remaining bytes
      const offset1 = 0
      const length1 = i
      const offset2 = i + marker.length
      const length2 = pdfBytes.length - offset2
      return { offset1, length1, offset2, length2 }
    }
  }

  throw new Error('Signature placeholder not found in PDF bytes')
}

/**
 * Extract the bytes that are actually signed (the two ranges, concatenated).
 */
export function extractSignedBytes(pdfBytes: Uint8Array, range: ByteRange): Uint8Array {
  const { offset1, length1, offset2, length2 } = range
  const signed = new Uint8Array(length1 + length2)
  signed.set(pdfBytes.subarray(offset1, offset1 + length1), 0)
  signed.set(pdfBytes.subarray(offset2, offset2 + length2), length1)
  return signed
}

/**
 * Write a hex-encoded signature into the placeholder region of a PDF byte
 * array (in-place).  The signature hex must be ≤ SIGNATURE_PLACEHOLDER_HEX_LEN chars;
 * it is zero-padded on the right to fill the field.
 */
export function writeSignatureIntoPlaceholder(
  pdfBytes: Uint8Array,
  range: ByteRange,
  signatureHex: string,
): Uint8Array {
  if (signatureHex.length > SIGNATURE_PLACEHOLDER_HEX_LEN) {
    throw new Error(
      `Signature hex length ${signatureHex.length} exceeds placeholder length ${SIGNATURE_PLACEHOLDER_HEX_LEN}`,
    )
  }
  // Pad to exact placeholder length
  const padded = signatureHex.padEnd(SIGNATURE_PLACEHOLDER_HEX_LEN, '0')
  const result = new Uint8Array(pdfBytes)

  // Write '<' + padded hex + '>'
  // The '<' is at offset1+length1, hex follows, '>' closes
  const sigBytes = Buffer.from(CONTENTS_OPEN + padded + CONTENTS_CLOSE, 'ascii')
  for (let i = 0; i < sigBytes.length; i++) {
    result[range.offset1 + range.length1 + i] = sigBytes[i]
  }
  return result
}

/**
 * Read the signature hex back out of a signed PDF.
 * Strips any trailing zero-padding so the caller gets the real sig hex.
 */
export function readSignatureFromPdf(pdfBytes: Uint8Array, range: ByteRange): string {
  const start = range.offset1 + range.length1
  // start points at '<', skip it
  const hexStart = start + 1
  const hexEnd   = hexStart + SIGNATURE_PLACEHOLDER_HEX_LEN
  const hexBytes = pdfBytes.subarray(hexStart, hexEnd)
  const hex = Buffer.from(hexBytes).toString('ascii')

  // Detect signature format:
  // 1. DER format: starts with '30'
  if (hex.startsWith('30')) {
    const derLen = parseInt(hex.slice(2, 4), 16)
    if (!isNaN(derLen) && derLen > 0) {
      return hex.slice(0, (2 + derLen) * 2)
    }
  }

  // 2. IEEE P1363 format (default for WebCrypto): exactly 64 bytes = 128 hex chars
  if (hex.length >= 128) {
    return hex.slice(0, 128)
  }

  return hex.replace(/0+$/, '')
}
