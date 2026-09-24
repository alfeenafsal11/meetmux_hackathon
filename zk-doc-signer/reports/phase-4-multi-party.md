# Phase 4 — Multi-Party Signing Report

**Date:** 2026-09-24  
**Status:** ✅ Complete — awaiting approval for Phase 5

---

## Opening Clarification on PDF ByteRange

**ByteRange Clarification:** The signed PDF uses a custom byte-offset scheme (embedding the signature in a designated `ZkSigInfo` container located by structural delimiters `<[0-9a-fA-F]{512}>`) verified by our own `verifySignedPdf`, rather than a standard Adobe/PAdES `/ByteRange` array inside a PDF signature dictionary (`/Sig`).

*(Note recorded for Phase 6 demo script: ensure the walkthrough notes the 10-minute TTL on the GET `/sign-pdf` prepared-cache, with automatic re-prepare fallback).*

---

## What Was Built

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Added `signingMode` (`'sequential' \| 'parallel'`) and `status` (`'pending' \| 'completed'`) to `Document`. Added `@default("")` to `Signer.publicKey` for pre-registering signers before key generation |
| `src/types/index.ts` | Updated `DocumentRecord` type with `signingMode` and `status` |
| `src/lib/multiParty/signerQueue.ts` | Queue logic helper: `validateSignerTurn` (enforces order for sequential; allows any pending for parallel; rejects out-of-turn with 403), `checkAllSigned`, and `getCurrentActiveSigner` |
| `src/app/api/documents/route.ts` | Updated `POST` to accept `signingMode` and `signers` array; updated `GET` to return mode, status, and sorted signers |
| `src/app/api/documents/[id]/route.ts` | Added `GET /api/documents/:id` endpoint returning document metadata, signingMode, status, and full signer queue |
| `src/app/api/documents/[id]/sign/route.ts` | Updated `POST`: checks signer turn, enforces sequential ordering, updates signer state, auto-advances queue, transitions document to `completed` once all parties sign |
| `src/app/api/documents/[id]/sign-pdf/route.ts` | Added multi-party turn validation and completion checks to PDF signing route |
| `src/components/SignerQueue.tsx` | UI component displaying ordered or parallel signer list, current turn badges, signed timestamps, and completion banners |
| `tests/multi-party.test.ts` | 10 comprehensive tests: queue logic unit tests, 2-signer sequential flow with out-of-turn rejection, 3-signer parallel flow, and edge cases |

---

## Actual Test Output

```
> zk-doc-signer@0.1.0 test
> vitest run

 ✓ tests/ecdsa.test.ts (11 tests) 27ms
 ✓ tests/audit-chain.test.ts (18 tests) 33ms
 ✓ tests/multi-party.test.ts (10 tests) 140ms
 ✓ tests/pdf-downloaded.test.ts (2 tests) 23ms
 ✓ tests/pdf-sign.test.ts (10 tests) 102ms

 Test Files  5 passed (5)
      Tests  51 passed (51)
   Start at  14:39:20
   Duration  1.43s
```

### Test Breakdown (Phase 4 Multi-Party Suite — 10 tests)

| Test | Type | Result |
|------|------|--------|
| sequential: permits signer 1 first | Unit | ✅ |
| sequential: rejects signer 2 out-of-turn when signer 1 is pending | Unit | ✅ |
| sequential: permits signer 2 after signer 1 has signed | Unit | ✅ |
| parallel: permits any pending signer regardless of order | Unit | ✅ |
| rejects a signer who has already signed | Unit | ✅ |
| rejects an unregistered signer when signers are configured | Unit | ✅ |
| checkAllSigned detects complete and incomplete sets | Unit | ✅ |
| getCurrentActiveSigner returns next pending in order | Unit | ✅ |
| 2-signer sequential flow enforces order, auto-advances, and completes | End-to-End | ✅ |
| 3-signer parallel flow allows signing in arbitrary order and completes | End-to-End | ✅ |

---

## Live API Verification Output

### Test 1: Sequential 2-Signer Flow (Alice -> Bob)

1. **Document Created** with `signingMode: "sequential"`:
   ```json
   {
     "id": "cmufb95d60000uuhs2z1u4jey",
     "signingMode": "sequential",
     "status": "pending",
     "signers": [
       { "name": "Alice Partner", "order": 1, "status": "pending" },
       { "name": "Bob Partner", "order": 2, "status": "pending" }
     ]
   }
   ```

2. **Bob attempts to sign out of turn**:
   ```
   POST /api/documents/cmufb95d60000uuhs2z1u4jey/sign
   HTTP 403 Forbidden
   Response: {
     "ok": false,
     "error": "Out-of-turn: It is currently Alice Partner's turn (order #1) to sign.",
     "currentSigner": { "id": "cmufb95d60001uuhsynxxvxqp", "name": "Alice Partner", "order": 1 }
   }
   ```

3. **Alice signs (in turn)**:
   ```
   POST /api/documents/cmufb95d60000uuhs2z1u4jey/sign
   HTTP 200 OK
   Response: {
     "signerId": "cmufb95d60001uuhsynxxvxqp",
     "verified": true,
     "signingMode": "sequential",
     "documentStatus": "pending",
     "allSigned": false,
     "nextSigner": { "id": "cmufb95d60002uuhshwsj11z8", "name": "Bob Partner", "order": 2 }
   }
   ```

4. **Bob signs (auto-advanced to Bob's turn)**:
   ```
   POST /api/documents/cmufb95d60000uuhs2z1u4jey/sign
   HTTP 200 OK
   Response: {
     "signerId": "cmufb95d60002uuhshwsj11z8",
     "verified": true,
     "signingMode": "sequential",
     "documentStatus": "completed",
     "allSigned": true,
     "nextSigner": null
   }
   ```

5. **Verification endpoint checks both signers**:
   ```
   POST /api/documents/cmufb95d60000uuhs2z1u4jey/verify ->
   {
     "allSignaturesValid": true,
     "signers": [
       { "name": "Alice Partner", "valid": true },
       { "name": "Bob Partner", "valid": true }
     ]
   }
   ```

---

### Test 2: Parallel 3-Signer Flow (X, Y, Z in arbitrary order: Y -> Z -> X)

1. **Document Created** with `signingMode: "parallel"` and 3 signers (Founder X, Founder Y, Founder Z).
2. **Founder Y signs first**: HTTP 200 OK, `docStatus: "pending"`, `allSigned: false`.
3. **Founder Z signs second**: HTTP 200 OK, `docStatus: "pending"`, `allSigned: false`.
4. **Founder X signs third**: HTTP 200 OK, `docStatus: "completed"`, `allSigned: true`.
5. **Final Verification**:
   ```json
   {
     "allSignaturesValid": true,
     "signers": [
       { "email": "x@charter.com", "valid": true },
       { "email": "y@charter.com", "valid": true },
       { "email": "z@charter.com", "valid": true }
     ]
   }
   ```
6. **Audit Trail Verification**:
   `GET /api/audit/:docId` returns `totalEntries: 4` (1 upload + 3 signs), `chainValid: true`.

---

## Deviations from Plan

- None. Both sequential and parallel multi-party modes follow the specification in `IMPLEMENTATION_PLAN.md`. Threshold ECDSA (GG18) was kept strictly out of scope as specified.

---

## What's Next (Phase 5 — Zero-Knowledge Proof Layer)

- Non-interactive Schnorr proof-of-knowledge (Fiat-Shamir heuristic) over ECDSA P-256 using `@noble/curves`.
- Flow:
  1. `POST /api/zk/challenge` — Server issues ephemeral random challenge.
  2. Client computes Schnorr commitment + response without revealing private key or producing a document signature.
  3. `POST /api/zk/prove` & `POST /api/zk/verify` — Server verifies the proof before accepting subsequent signatures.
- Tests: Valid proof passes; proof with wrong public key fails; replay of expired challenge is rejected.
