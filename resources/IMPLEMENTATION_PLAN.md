# Zero-Knowledge Document Signing & Cryptographic Verification
### Implementation Plan, Agent Prompt, and File Structure

Stack: Next.js (App Router) + Node.js + Web Crypto API (ECDSA P-256 / SHA-256), Prisma + SQLite/Postgres, pdf-lib, @noble/curves.

---

## 1. Phase-Wise Implementation Plan

Each phase must be fully working and tested before the next begins. No phase after Phase 6 is started unless explicitly approved.

### Phase 0 — Scaffolding
- Init Next.js + TypeScript project; Prisma with SQLite (swap to Postgres later if needed).
- Health check route, README with run instructions, test runner (Vitest) configured.
- **Deliverable:** app boots, `npm run dev` and `npm test` both succeed on an empty test suite.

### Phase 1 — Core ECDSA Signing
- Key generation: client via Web Crypto (`extractable:false`), server via Node `crypto.generateKeyPairSync('ec', {namedCurve:'P-256'})`.
- Document upload → SHA-256 hash → ECDSA sign(hash) → verify(sig, hash, pubKey).
- Endpoints: `POST /api/documents`, `POST /api/documents/:id/sign`, `POST /api/documents/:id/verify`.
- **Tests:** sign/verify round trip; flip one byte of the doc and confirm verification fails.
- **Deliverable:** working sign+verify for arbitrary uploaded files.

### Phase 2 — Tamper-Evident Audit Trail
- Append-only log: `{id, docId, signerId, action, signature, timestamp, prevHash, entryHash}`, where `entryHash = SHA256(prevHash + canonicalJSON(entry))`.
- Periodic Merkle root over log entries, root signed by server key.
- Endpoints: `GET /api/audit/:docId`, `GET /api/audit/root`, `POST /api/audit/verify-chain`.
- Dev-only `POST /api/audit/simulate-tamper` that directly mutates one log row in the DB (for live demo of detection — not exposed in prod build).
- **Tests:** verify-chain detects induced tampering; inclusion proof for a given entry checks out.
- **Deliverable:** demoable proof chain, including a "break it live" demo path.

### Phase 3 — PDF Handling
- Use `pdf-lib`: insert a signature field with a hex-zero placeholder, compute SHA-256 over the `/ByteRange` (excluding the placeholder), sign, write signature bytes back via incremental update.
- Explicitly **out of scope**: full PDF/A-3 conversion — note as a known limitation in the README.
- Endpoints: `POST /api/documents/:id/upload-pdf`, `POST /api/documents/:id/sign-pdf`.
- **Tests:** sign a sample PDF; re-derive the byte-range hash and verify; edit PDF content post-signing and confirm verification fails.
- **Deliverable:** a real signed PDF, downloadable and independently re-verifiable.

### Phase 4 — Multi-Party Signing
- Sequential: ordered `signerList`, only the current signer may sign, auto-advances.
- Parallel: unordered `signerSet`, each signs independently, document is "complete" once all have signed.
- UI: signer queue with pending/complete status.
- **Out of scope for core:** threshold ECDSA (GG18) — interactive multi-round protocol, too heavy for the timeframe. Noted as Phase 7 stretch.
- **Tests:** 2-signer sequential flow; 3-signer parallel flow; reject a signer signing out of turn.
- **Deliverable:** a document signed end-to-end by 2–3 parties.

### Phase 5 — Zero-Knowledge Proof Layer (core ZK feature)
- Implement a **non-interactive Schnorr proof-of-knowledge (Fiat–Shamir heuristic) over P-256**: a signer proves possession of the private key for a registered public key, without revealing the key or producing a signature. No trusted setup; pure JS via `@noble/curves`.
- Flow: server issues a random challenge → client computes commitment + response → server verifies the proof before accepting the signer's subsequent ECDSA signature.
- Endpoints: `POST /api/zk/challenge`, `POST /api/zk/prove`, `POST /api/zk/verify`.
- **Tests:** valid proof passes; proof against the wrong public key fails; replaying an old proof against a new challenge is rejected.
- **Deliverable:** a "Prove Identity" step in the signing UI, backed by a genuinely zero-knowledge protocol.
- **Optional stretch, only if ahead of schedule:** a snarkjs/circom circuit proving knowledge of a SHA-256 preimage (document possession) as a second, SNARK-based proof. Flag as high risk of not finishing — do not let it block Phase 6.

### Phase 6 — Verification Dashboard & Demo Packaging
- Public `/verify` page: paste a docId or upload a file → show ECDSA signature validity, audit-chain integrity, ZK proof status, and per-signer status in one view.
- Generate a downloadable "Verification Certificate" (JSON, optionally a simple PDF) summarizing the full proof chain.
- Final README, architecture diagram, and a short demo script (what to click, in what order, to show tamper detection and the ZK step).
- **Deliverable:** the whole thing, demoable start to finish.

### Phase 7 — Optional stretch (only after Phase 6 is fully done and approved)
- Blockchain testnet anchoring of the Merkle root (e.g. Sepolia via ethers.js).
- WebAuthn-backed key storage.
- Threshold ECDSA or a full ECDSA-in-circuit SNARK.

