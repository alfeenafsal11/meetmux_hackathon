# Meetmux - Zero-Knowledge Document Signer & Verifier

[![Live Streamlit App](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://meetmux-hackathon.streamlit.app)
[![GitHub](https://img.shields.io/badge/GitHub-alfeenafsal11%2Fmeetmux__hackathon-blue?logo=github)](https://github.com/alfeenafsal11/meetmux_hackathon)

> **Live Deployed Application:** [https://meetmux-hackathon.streamlit.app](https://meetmux-hackathon.streamlit.app)

A cryptographic document signing, zero-knowledge verification, and tamper-evident audit platform built for the Meetmux Hackathon.

---

## 🌟 Highlights & Capabilities

- **Interactive Schnorr Zero-Knowledge Proofs**: Prove possession of your private key without revealing the secret or signing arbitrary payloads. 100% computed client-side in the browser.
- **ECDSA P-256 Document Signing**: High-security NIST P-256 digital signatures with SHA-256 document hashing.
- **Tamper-Evident Hash Chained Audit Trail**: Append-only ledger with Merkle root anchoring and live tamper-detection simulation.
- **Multi-Party Signing Ceremonies**: Both sequential (strict queue enforcement) and parallel signing workflows with auto-finalization.
- **Cryptographic Verification Certificate**: Public verification dashboard with one-click verification certificate download (JSON).

---

## 🚀 Live Demo & Deployments

- **Streamlit Live Cloud**: [https://meetmux-hackathon.streamlit.app](https://meetmux-hackathon.streamlit.app)
- **GitHub Repository**: [https://github.com/alfeenafsal11/meetmux_hackathon](https://github.com/alfeenafsal11/meetmux_hackathon)

---

## 📂 Project Structure

```text
meetmux_hackathon/
├── streamlit_app.py        # Streamlit interactive cryptographic dashboard & demo
├── app.py                  # Streamlit entrypoint
├── requirements.txt        # Python dependencies for Streamlit
├── zk-doc-signer/          # Complete Next.js 16 (App Router) + TypeScript application
│   ├── src/
│   │   ├── app/            # App Router pages (/sign/[docId], /verify, API routes)
│   │   ├── components/     # UI components (ZKProveModal, AuditTrailView, etc.)
│   │   └── lib/            # Crypto, PDF handling, multi-party logic, ZK Schnorr
│   ├── prisma/             # Prisma schema & SQLite migrations
│   ├── tests/              # 70 unit and integration tests (Vitest)
│   ├── docs/               # Architecture diagrams and demo click script
│   └── README.md           # Detailed technical guide for Next.js app
└── README.md               # Repository documentation
```

---

## 💻 Local Setup & Running

### Option 1: Streamlit Cloud / Local Python App

```bash
# Install Python requirements
pip install -r requirements.txt

# Run the Streamlit application
streamlit run streamlit_app.py
```

### Option 2: Full Next.js Web Application (`zk-doc-signer`)

```bash
cd zk-doc-signer

# Install Node dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
# Open http://localhost:3000

# Run automated cryptographic test suites
npm test
```

---

## 🧪 Automated Cryptographic Tests

All 7 test suites (70 tests total) pass with Vitest:
- `tests/verification-summary.test.ts`
- `tests/zk-schnorr.test.ts`
- `tests/ecdsa.test.ts`
- `tests/audit-chain.test.ts`
- `tests/multi-party.test.ts`
- `tests/pdf-sign.test.ts`
- `tests/pdf-downloaded.test.ts`
