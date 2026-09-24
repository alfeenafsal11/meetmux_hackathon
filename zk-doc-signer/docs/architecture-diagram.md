# ZK Doc Signer — System Architecture

```mermaid
flowchart TB
    subgraph ClientLayer ["Client Layer (Browser)"]
        UI_Home["Landing Dashboard\n(/)"]
        UI_Sign["Signing Ceremony\n(/sign/[docId])"]
        UI_Verify["Verification Dashboard\n(/verify)"]
        ZK_Modal["ZKProveModal\n(Interactive Schnorr)"]
        WebCrypto["Web Crypto API\n(ECDSA P-256 / SHA-256)"]
        ClientNoble["@noble/curves/p256\n(Client-Side ZK Math)"]
    end

    subgraph APILayer ["Next.js App Router (API Routes)"]
        API_Doc["/api/documents\n- Upload & List\n- Multi-party Config"]
        API_Sign["/api/documents/:id/sign\n- Turn Enforcement\n- Auto-advancing Queue"]
        API_Pdf["/api/documents/:id/sign-pdf\n- Byte-Range Hashing\n- Placeholder Injection"]
        API_Audit["/api/audit/*\n- Log Chain Verification\n- Server-Signed Merkle Root\n- /simulate-tamper (dev)"]
        API_ZK["/api/zk/*\n- /challenge (5m TTL)\n- /verify (Burn on use)\n- /prove (dev harness)"]
    end

    subgraph CoreEngine ["Cryptographic & Proof Engine (src/lib)"]
        Lib_ECDSA["crypto/ecdsa.ts\n(Sign & Verify P-256)"]
        Lib_Hash["crypto/hash.ts\n(SHA-256, Canonical JSON)"]
        Lib_PDF["pdf/byteRange.ts & signPdf.ts\n(Custom Offset Container)"]
        Lib_Queue["multiParty/signerQueue.ts\n(Sequential & Parallel)"]
        Lib_Audit["audit/log.ts & merkle.ts\n(Hash Chaining, Merkle Root)"]
        Lib_ZK["zk/schnorrIdent.ts\n(Interactive Schnorr Sigma Engine)"]
    end

    subgraph StorageLayer ["Persistence Layer"]
        DB[(Prisma SQLite Database\nDocument, Signer, AuditEntry)]
        MemCache["In-Memory Stores (globalThis)\n- Prepared PDF Cache (10m TTL)\n- ZK Challenge Store (5m TTL)"]
    end

    %% Client to API
    UI_Home -->|"Create doc & signers"| API_Doc
    UI_Sign -->|"Submit signature"| API_Sign
    UI_Sign -->|"Fetch byte range & sign PDF"| API_Pdf
    UI_Sign -->|"Open ZK modal"| ZK_Modal
    ZK_Modal -->|"1. Request challenge"| API_ZK
    ZK_Modal -.->|"2. Compute (R, s) locally"| ClientNoble
    ZK_Modal -->|"3. Verify proof (R, s)"| API_ZK
    UI_Verify -->|"Fetch verification & audit"| API_Audit

    %% API to Lib
    API_Doc --> Lib_Hash & Lib_Audit
    API_Sign --> Lib_ECDSA & Lib_Queue & Lib_Audit
    API_Pdf --> Lib_PDF & Lib_ECDSA & Lib_Audit
    API_Audit --> Lib_Audit
    API_ZK --> Lib_ZK

    %% Lib to Storage
    CoreEngine --> DB
    API_Pdf <--> MemCache
    API_ZK <--> MemCache
```

---

## Architectural Highlights

1. **Pure In-Browser Zero-Knowledge Prover**:
   The user's private key never leaves the client browser. `ZKProveModal` executes `@noble/curves/p256` locally to compute the commitment $R = k \cdot G$ and scalar response $s = (k + e \cdot x) \pmod n$. Only $(R, s)$ are submitted across the network to `/api/zk/verify`.
2. **Context-Bound Ephemeral Challenges**:
   Server challenges are single-use nonces bound to `docId` with a 5-minute TTL. The challenge scalar $e = \text{SHA-256}(\text{nonce} \parallel \text{docId} \parallel P \parallel R) \pmod n$ mathematically binds the proof to the session and burns upon first verification to prevent replay attacks.
3. **Multi-Party Policy Enforcement**:
   - **Sequential Mode**: Strict queue order is enforced server-side. Signers attempting to sign out-of-turn receive HTTP 403. Queue auto-advances upon successful signing.
   - **Parallel Mode**: Unordered set where any designated signer may sign in any order.
   - The document automatically transitions to `completed` once all designated signers have signed.
4. **Append-Only Tamper-Evident Audit Chain**:
   Each entry is cryptographically chained via $\text{entryHash} = \text{SHA-256}(\text{prevHash} \parallel \text{canonicalJSON}(\text{entry}))$. A binary Merkle tree is computed over entry hashes, and the root is signed by the server key. Tampering with any historical entry breaks the hash chain and is immediately flagged by the verification dashboard.
5. **Consolidated Tamper Detection Summary**:
   The `/verify` dashboard derives a single, unified `tampered: true/false` status combining file hash matching, ECDSA signature validity, and audit chain integrity.
