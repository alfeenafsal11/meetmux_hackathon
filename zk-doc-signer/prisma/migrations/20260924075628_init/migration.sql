-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sha256Hash" TEXT NOT NULL,
    "fileData" BLOB,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Signer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "signature" TEXT,
    "signedAt" DATETIME,
    "order" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Signer_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "signerId" TEXT,
    "action" TEXT NOT NULL,
    "signature" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevHash" TEXT,
    "entryHash" TEXT NOT NULL,
    "merkleRoot" TEXT,
    CONSTRAINT "AuditEntry_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
