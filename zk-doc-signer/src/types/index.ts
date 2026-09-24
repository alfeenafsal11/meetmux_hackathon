// Shared TypeScript types — extended incrementally across phases

// ── Documents ──────────────────────────────────────────────────────────────

export interface DocumentRecord {
  id: string
  name: string
  sha256Hash: string
  mimeType: string
  signingMode: 'sequential' | 'parallel'
  status: 'pending' | 'completed'
  createdAt: string
  signers: SignerRecord[]
}

export interface SignerRecord {
  id: string
  documentId: string
  name: string
  email: string
  publicKey: string
  signature?: string | null
  signedAt?: string | null
  order?: number | null
  status: 'pending' | 'signed'
}

// ── Audit ───────────────────────────────────────────────────────────────────

export type AuditAction = 'upload' | 'sign' | 'verify' | 'tamper-detected'

export interface AuditEntryRecord {
  id: string
  docId: string
  signerId?: string | null
  action: AuditAction
  signature?: string | null
  timestamp: string
  prevHash?: string | null
  entryHash: string
  merkleRoot?: string | null
}

// ── ZK / Schnorr ────────────────────────────────────────────────────────────

export interface ZKChallenge {
  challengeId: string
  challenge: string   // hex random nonce
  expiresAt: number   // unix ms
}

export interface SchnorrProof {
  commitment: string  // hex point
  response: string    // hex scalar
}

// ── API Responses ───────────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  ok: true
  data: T
}

export interface ApiError {
  ok: false
  error: string
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError
