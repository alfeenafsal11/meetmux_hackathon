## 3. File Structure

```
zk-doc-signer/
├── README.md
├── IMPLEMENTATION_PLAN.md
├── package.json
├── tsconfig.json
├── .env.example
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── sign/[docId]/page.tsx
│   │   ├── verify/page.tsx
│   │   └── api/
│   │       ├── documents/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── sign/route.ts
│   │       │       ├── sign-pdf/route.ts
│   │       │       ├── verify/route.ts
│   │       │       └── upload-pdf/route.ts
│   │       ├── audit/
│   │       │   ├── [docId]/route.ts
│   │       │   ├── root/route.ts
│   │       │   ├── verify-chain/route.ts
│   │       │   └── simulate-tamper/route.ts
│   │       └── zk/
│   │           ├── challenge/route.ts
│   │           ├── prove/route.ts
│   │           └── verify/route.ts
│   ├── components/
│   │   ├── SignerQueue.tsx
│   │   ├── AuditTrailView.tsx
│   │   ├── ZKProveModal.tsx
│   │   └── VerificationBadge.tsx
│   ├── lib/
│   │   ├── crypto/
│   │   │   ├── ecdsa.ts
│   │   │   ├── hash.ts
│   │   │   └── keys.ts
│   │   ├── pdf/
│   │   │   ├── byteRange.ts
│   │   │   └── signPdf.ts
│   │   ├── audit/
│   │   │   ├── log.ts
│   │   │   ├── merkle.ts
│   │   │   └── chain.ts
│   │   ├── zk/
│   │   │   ├── schnorrNizk.ts
│   │   │   └── challengeStore.ts
│   │   └── db.ts
│   └── types/
│       └── index.ts
├── tests/
│   ├── ecdsa.test.ts
│   ├── pdf-sign.test.ts
│   ├── audit-chain.test.ts
│   ├── multi-party.test.ts
│   └── zk-nizk.test.ts
└── docs/
    ├── architecture-diagram.md   (mermaid, mirrors the report's diagram)
    └── demo-script.md
```
