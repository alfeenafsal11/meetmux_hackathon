# ZK Doc Signer — Live Demo Walkthrough Script

A complete, click-by-click walkthrough of the end-to-end cryptographic signing, multi-party workflow, Interactive Schnorr ZK proof, tamper-evident audit trail, and verification certificate export.

---

## Prerequisites & Runtime Environment

- **Server**: Run `npm run dev` in the background (listens on `http://localhost:3000`).
- **Architecture Constraint**: The ephemeral challenge store and PDF prepared byte cache are bound to `globalThis` in memory. Run as a **single persistent server process** for the demonstration (serverless lambdas would require an external Redis/database store).
- **Session Timers**:
  - `GET /sign-pdf` prepared cache has a **10-minute TTL**.
  - ZK challenge nonces have a **5-minute TTL** and are single-use (burned upon verification).
- **PDF Scheme Note**: The signed PDF uses a designated structural container (`ZkSigInfo`) with byte offsets verified by `verifySignedPdf` (custom byte-offset scheme, not full Adobe PAdES).

---

## Demo Walkthrough Steps

### Step 1: Upload Document & Configure Multi-Party Policy
1. Open your browser to `http://localhost:3000`.
2. Under **Upload New Document**:
   - Select a sample PDF or document (e.g. `test_sample.pdf`).
   - Enter a display name: `Master Partnership Agreement`.
   - Choose **Policy**: Select **⇄ Sequential Order (Enforced Turn)**.
   - Configure Signers:
     - Signer #1: `Alice Partner` (`alice@example.com`)
     - Signer #2: `Bob Partner` (`bob@example.com`)
3. Click **🚀 Create Document Record**.
4. The document appears immediately in the **Registered Documents** list with status **● Pending**. Note the Document ID.

---

### Step 2: Open Signing Ceremony & Test Turn Enforcement
1. In the document card on the home page, click **🖋️ Sign** (opens `/sign/[docId]`).
2. Notice the **Signer Queue** on the right side:
   - Alice is marked **▶ Current Turn (#1)**.
   - Bob is marked **Waiting (#2)**.
3. Test out-of-turn protection:
   - Type Bob's name and email (`bob@example.com`).
   - Click **⚡ Generate In-Browser Key**.
   - Attempt to click **Sign Document**:
   - The server immediately rejects the submission with **HTTP 403 Forbidden**:
     > *"Out-of-turn: It is currently Alice Partner's turn (order #1) to sign."*

---

### Step 3: Zero-Knowledge Identity Proof (In-Browser Schnorr)
1. Switch signer identity to **Alice** (`Alice Partner`, `alice@example.com`).
2. Click **⚡ Generate In-Browser Key**:
   - Generates a fresh NIST P-256 key pair in browser memory.
   - The private key is non-extractable and **never transmitted to any server**.
3. Click **🛡️ Prove Identity (ZK)**:
   - Opens the interactive Schnorr identification modal.
   - Click **Execute ZK Proof Protocol**:
     1. Browser requests ephemeral challenge nonce from `POST /api/zk/challenge` (bound to `docId`).
     2. Browser locally computes commitment $R = k \cdot G$ and scalar response $s = (k + e \cdot x) \pmod n$ using `@noble/curves/p256`.
     3. Browser submits only $(R, s)$ to `POST /api/zk/verify`.
     4. Server validates $s \cdot G = R + e \cdot P$ and burns the challenge.
   - Shows green **✓ Proof Validated** badge.

---

### Step 4: Sign Document & Auto-Advance Queue
1. If the uploaded document is a PDF:
   - Click **📄 Sign PDF (Byte-Range) & Download**:
   - Browser fetches `/ByteRange` hash, signs locally, and receives the signed PDF download (`signed-Master Partnership Agreement.pdf`).
2. If non-PDF:
   - Click **🖋️ Cryptographically Sign Document**.
3. Notice the **Signer Queue** automatically updates:
   - Alice Partner: **✓ Signed**.
   - Bob Partner: Auto-advanced to **▶ Current Turn (#2)**!

---

### Step 5: Second Signer Signs to Complete Document
1. In the signer info form, enter:
   - Name: `Bob Partner`
   - Email: `bob@example.com`
2. Click **⚡ Generate In-Browser Key**.
3. Click **Sign**:
   - Bob's signature is committed.
   - Both signers are now **✓ Signed**.
   - Document status transitions to **✓ Completed**.

---

### Step 6: Public Verification Dashboard (`/verify`)
1. Click **View Verification** or navigate to `http://localhost:3000/verify?docId=[docId]`.
2. Notice the consolidated status badge at the top:
   > **🛡️ CRYPTOGRAPHICALLY VERIFIED — UNTAMPERED**
   *(Unified summary derived from fileHashMatch + allSignaturesValid + auditChainValid)*
3. View the **Signer Queue** and individual ECDSA P-256 signature verification badges.
4. View the **Tamper-Evident Audit Trail**:
   - Shows the genesis upload entry and subsequent signing entries.
   - Displays the cryptographic `entryHash` and `prevHash` chaining.
   - Displays the calculated **Merkle Tree Root**.

---

### Step 7: "Break It Live" — Adversarial Tamper Demonstration
1. In the **Tamper-Evident Audit Trail** card on the verify page:
   - Locate the red demo section: **DEMO INTERACTIVE TOOL**.
   - Click **⚡ Simulate Tamper in DB**:
   - Directly mutates log entry #0 in the SQLite database via `POST /api/audit/simulate-tamper`.
2. The verification dashboard re-evaluates the cryptographic chain:
3. The consolidated banner immediately flips to:
   > **⚠️ TAMPER DETECTED — COMPROMISED**
4. The audit chain badge turns red:
   > **⚠️ Hash-Chain Broken**
   *(The cryptographic proof engine detected that stored entryHash != SHA-256(prevHash || canonicalJSON(mutatedEntry)))*

---

### Step 8: Download Verification Certificate
1. On the verification dashboard, click **📥 Download Verification Certificate (JSON)**.
2. Downloads `verification-certificate-[docName].json` containing:
   - Unique certificate ID and ISO-8601 timestamp.
   - Complete document metadata and SHA-256 hash.
   - Consolidated tamper summary.
   - Full list of signers, public keys, and cryptographic signatures.
   - Complete audit trail with Merkle root and hash-chain verification proofs.
