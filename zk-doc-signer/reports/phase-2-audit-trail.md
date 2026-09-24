# Phase 2 — Tamper-Evident Audit Trail Report

**Date:** 2026-09-24  
**Status:** ✅ Complete — awaiting approval for Phase 3

---

## Pre-Phase Fix Applied

- `package.json` `"engines"` loosened from `>=24.0.0` → `>=20.0.0` (actual `crypto.subtle` requirement).

---

## What Was Built

| File | Purpose |
|------|---------|
| `src/lib/audit/log.ts` | `appendAuditEntry` — chains `entryHash = SHA256(prevHash + canonicalJSON(payload))` |
| `src/lib/audit/merkle.ts` | Binary Merkle tree: root computation, inclusion proof gen + verification |
| `src/lib/audit/chain.ts` | `verifyChain` — re-derives every entryHash, checks prevHash linkage |
| `src/app/api/audit/[docId]/route.ts` | `GET /api/audit/:docId` |
| `src/app/api/audit/root/route.ts` | `GET /api/audit/root` (global Merkle root, server-signed) |
| `src/app/api/audit/verify-chain/route.ts` | `POST /api/audit/verify-chain` (+ optional inclusion proof) |
| `src/app/api/audit/simulate-tamper/route.ts` | `POST /api/audit/simulate-tamper` (dev-only) |
| `src/app/api/documents/route.ts` | Hooked: appends `upload` audit entry on document create |
| `src/app/api/documents/[id]/sign/route.ts` | Hooked: appends `sign` audit entry on successful signing |
| `tests/audit-chain.test.ts` | 18 tests (canonicalJSON, entryHash, chain verify, Merkle, proofs) |

---

## Actual Test Output

```
> zk-doc-signer@0.1.0 test
> vitest run

 ✓ tests/ecdsa.test.ts (11 tests) 25ms
 ✓ tests/audit-chain.test.ts (18 tests) 27ms

 Test Files  2 passed (2)
      Tests  29 passed (29)
   Duration  954ms
```

### Test breakdown (Phase 2 suite — 18 tests)

| Test | Result |
|------|--------|
| canonicalJSON is deterministic regardless of key order | ✅ |
| computeEntryHash is deterministic | ✅ |
| computeEntryHash changes when payload changes | ✅ |
| verifyChain passes for empty chain | ✅ |
| verifyChain passes for single-entry chain | ✅ |
| verifyChain passes for 5-entry chain | ✅ |
| verifyChain detects mutated entryHash | ✅ |
| verifyChain detects mutated action field | ✅ |
| verifyChain detects broken prevHash link | ✅ |
| computeMerkleRoot returns genesis for empty list | ✅ |
| computeMerkleRoot returns single leaf for 1-element list | ✅ |
| computeMerkleRoot is deterministic | ✅ |
| computeMerkleRoot changes when one leaf changes | ✅ |
| computeMerkleRoot handles odd-length lists | ✅ |
| Inclusion proof round-trips for 4-leaf tree | ✅ |
| Inclusion proof round-trips for 5-leaf (odd) tree | ✅ |
| Inclusion proof fails if root is wrong | ✅ |
| Inclusion proof fails if leaf hash is wrong | ✅ |

---

## Live API Verification

### GET /api/audit/:docId — 2-entry chain (upload + sign)
```json
{
  "totalEntries": 2,
  "chainValid": true,
  "merkleRoot": "4362b60d...",
  "entries": [
    { "action": "upload", "prevHash": "0000...0000", "entryHash": "99ef60..." },
    { "action": "sign",   "prevHash": "99ef60...",   "entryHash": "a7765a..." }
  ]
}
```
`prevHash` of entry[1] = `entryHash` of entry[0] ✅

### POST /api/audit/verify-chain — clean chain + inclusion proof for entry[1]
```json
{
  "chainValid": true,
  "inclusionProof": {
    "leafIndex": 1,
    "proof": [{ "sibling": "99ef60...", "position": "left" }],
    "proofValid": true
  }
}
```

### POST /api/audit/simulate-tamper → POST /api/audit/verify-chain — tamper detected
**Tamper:** action `upload` → `tampered-upload` on entry[0]
```json
{
  "chainValid": false,
  "firstBadIndex": 0,
  "firstBadId": "cmuf9dm0u0008uuwsw6wmfya2",
  "reason": "Entry 0 entryHash mismatch: stored 99ef60..., recomputed 73b74d..."
}
```

### GET /api/audit/root — global Merkle root, server-signed
```json
{
  "totalEntries": 3,
  "merkleRoot": "516fb889...",
  "rootHash": "a262a300...",
  "rootSignature": "b9f07df6...",
  "serverPublicKey": "-----BEGIN PUBLIC KEY-----\n..."
}
```

---

## Deviations from Plan

1. **`_simulate-tamper` → `simulate-tamper`** — Next.js App Router treats folders starting with `_` as **private** (they are explicitly excluded from routing per the framework's conventions). The underscore folder created a silent 405. Renamed to `simulate-tamper`; the route is still dev-only (blocked by `NODE_ENV === 'production'` guard). This is a **deviation from the file structure** — flagging it explicitly. The plan's `FILE_STRUCTURE.md` shows `_simulate-tamper/route.ts`; the actual path is `simulate-tamper/route.ts`.

2. **Ephemeral server key in `/api/audit/root`** — the plan says "root signed by server key." Since no `SERVER_PRIVATE_KEY_PEM` env var is defined yet, the route generates an ephemeral key per process restart. The key is stable within a session. This is fine for Phase 2 demo; Phase 6 can wire it to a persistent env var if needed.

---

## What's Next (Phase 3)

- `src/lib/pdf/byteRange.ts` — locate/compute the ByteRange in a PDF
- `src/lib/pdf/signPdf.ts` — insert signature field, compute SHA-256 over ByteRange, write signature bytes back via incremental update using `pdf-lib`
- Implement `POST /api/documents/:id/upload-pdf` and `POST /api/documents/:id/sign-pdf`
- Tests: sign sample PDF, re-derive byte-range hash, verify; post-sign edit → fail
