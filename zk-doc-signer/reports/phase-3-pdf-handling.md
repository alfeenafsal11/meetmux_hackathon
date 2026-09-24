# Phase 3 — PDF Byte-Range Signing Report

**Date:** 2026-09-24  
**Status:** ✅ Complete — awaiting approval for Phase 4

---

## Pre-Phase Follow-ups Confirmed

1. **`IMPLEMENTATION_PLAN.md` updated**: Line 28 updated from `POST /api/audit/_simulate-tamper` to `POST /api/audit/simulate-tamper` to maintain the plan document as the source of truth going forward.
2. **Audit scope confirmation**: Confirmed — `/api/audit/root` computes a global Merkle root across all audit entries across the entire database (all documents), whereas `/api/audit/:docId` is strictly scoped to audit entries for that specific document ID.

---

## What Was Built

| File | Purpose |
|------|---------|
| `src/lib/pdf/byteRange.ts` | PDF byte-range arithmetic: `injectPlaceholder`, `locatePlaceholder`, `extractSignedBytes`, `writeSignatureIntoPlaceholder`, `readSignatureFromPdf` |
| `src/lib/pdf/signPdf.ts` | End-to-end PDF signing and verification (`signPdf`, `verifySignedPdf` with structural field locator) |
| `src/app/api/documents/[id]/upload-pdf/route.ts` | `POST /api/documents/:id/upload-pdf` — uploads and attaches PDF bytes to document record |
| `src/app/api/documents/[id]/sign-pdf/route.ts` | `GET` (prepare placeholder + calculate byteRangeHash + in-memory cache) and `POST` (verify client ECDSA signature over byte-range hash + write signature into placeholder + return signed PDF) |
| `tests/pdf-sign.test.ts` | 10 tests covering placeholder embedding, byte-range arithmetic, signing, re-derivation, tamper detection, and wrong-key rejection |
| `tests/pdf-downloaded.test.ts` | 2 live verification tests verifying the actual signed PDF returned by the server endpoint and tamper rejection |

---

## Actual Test Output

```
> zk-doc-signer@0.1.0 test
> vitest run

 ✓ tests/ecdsa.test.ts (11 tests) 26ms
 ✓ tests/audit-chain.test.ts (18 tests) 286ms
 ✓ tests/pdf-downloaded.test.ts (2 tests) 25ms
 ✓ tests/pdf-sign.test.ts (10 tests) 114ms

 Test Files  4 passed (4)
      Tests  41 passed (41)
   Start at  14:22:27
   Duration  1.45s
```

### Test Breakdown (Phase 3 PDF Suites — 12 tests)

| Test | Suite | Result |
|------|-------|--------|
| serialised PDF contains the placeholder marker bytes | pdf-sign | ✅ |
| finds the placeholder and returns valid offsets | pdf-sign | ✅ |
| signed bytes length equals (length1 + length2) | pdf-sign | ✅ |
| verifies successfully after signing | pdf-sign | ✅ |
| byteRangeHashHex matches re-derivation from the signed PDF | pdf-sign | ✅ |
| fails verification when a post-signing byte is flipped | pdf-sign | ✅ |
| fails verification when the PDF text content is changed post-signing | pdf-sign | ✅ |
| fails verification with a different public key | pdf-sign | ✅ |
| reads back the same hex that was written | pdf-sign | ✅ |
| throws if signature hex is too long for the placeholder | pdf-sign | ✅ |
| successfully verifies the PDF returned by POST /api/documents/:id/sign-pdf | pdf-downloaded | ✅ |
| fails verification on tampered signed PDF | pdf-downloaded | ✅ |

---

## Live API Verification Output

### 1. Document Upload & PDF Attachment
```
POST /api/documents -> ID: cmufake5n000nuuwsha4awk3c (879 bytes)
POST /api/documents/:id/upload-pdf -> Status 200 OK
```

### 2. GET /api/documents/:id/sign-pdf (Prepare PDF & ByteRange)
```json
{
  "ok": true,
  "data": {
    "documentId": "cmufake5n000nuuwsha4awk3c",
    "byteRange": {
      "offset1": 0,
      "length1": 1129,
      "offset2": 1643,
      "length2": 267
    },
    "byteRangeHashHex": "0fb98daffdee80a68f21c3bd83a9f4c58c16960092bec05e7e22dc4acdb0229f"
  }
}
```

### 3. Client-Side ECDSA P-256 Signing & POST
- Client signed `0fb98daffdee80a68f21c3bd83a9f4c58c16960092bec05e7e22dc4acdb0229f` with WebCrypto ECDSA P-256 private key.
- Submitted to `POST /api/documents/:id/sign-pdf`:
```
POST Status: 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="signed-test_sample.pdf.pdf"
X-ByteRange-Hash: 0fb98daffdee80a68f21c3bd83a9f4c58c16960092bec05e7e22dc4acdb0229f
X-Signer-Id: cmufakecs000ruuwsat2uu5vk
Signed PDF Payload: 1,910 bytes
```

### 4. Independent Verification & Tamper Detection
- **Original Signed PDF**: `verifySignedPdf` returned `valid: true`, matching byte-range hash `0fb98daffdee...`.
- **Tampered PDF (1 bit flipped at byte 10)**: `verifySignedPdf` returned `valid: false` (signature invalid for re-derived byte-range hash).

---

## Deviations from Plan & Design Decisions

1. **Two-Step Endpoint for `/api/documents/:id/sign-pdf`**:
   `pdf-lib` serializes documents with timestamps and object IDs, meaning two consecutive serialization calls produce different byte-range layouts and hashes. To ensure the client signs the exact byte stream that the server later inserts the signature into, `GET /api/documents/:id/sign-pdf` prepares the document and caches it in memory (10-minute TTL). When the client calls `POST`, the server reuses the prepared bytes, verifies the signature against the identical byte-range hash, writes the signature into the reserved placeholder, and clears the cache.
2. **Structural Signature Locator in `verifySignedPdf`**:
   Rather than searching for the all-zero placeholder (which is replaced after signing), `locateSignatureField` identifies the signature container by its delimiters and length (`<` + 512 hex chars + `>`), allowing both pre-signed and post-signed PDFs to be verified without requiring sidecar byte-range offsets.
3. **Known Limitation Noted**: Full PDF/A-3 conversion is explicitly out of scope per the plan and documented.

---

## What's Next (Phase 4 — Multi-Party Signing)

- Sequential signing queue (`signerList`, enforced order, auto-advancing current signer).
- Parallel signing set (`signerSet`, independent signatures, completion when all signers have signed).
- UI component: `SignerQueue.tsx` with pending/complete statuses.
- Tests: 2-signer sequential flow, 3-signer parallel flow, rejection of out-of-turn signatures.
