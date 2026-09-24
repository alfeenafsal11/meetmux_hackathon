/**
 * summary.ts — Verification summary derivation & certificate packaging
 */

export interface VerificationEvaluationParams {
  fileHashMatch: boolean | null
  allSignaturesValid: boolean
  auditChainValid: boolean
}

/**
 * Derives the single consolidated "tampered" boolean status.
 *
 * Requirements:
 * - If fileHashMatch is false -> tampered: true
 * - If allSignaturesValid is false -> tampered: true
 * - If auditChainValid is false -> tampered: true
 * - Only when all valid conditions hold -> tampered: false
 */
export function deriveTamperedStatus({
  fileHashMatch,
  allSignaturesValid,
  auditChainValid,
}: VerificationEvaluationParams): boolean {
  if (fileHashMatch === false) return true
  if (!allSignaturesValid) return true
  if (!auditChainValid) return true
  return false
}

export interface CertificateBuildParams {
  doc: {
    id: string
    name: string
    sha256Hash: string
    mimeType?: string
    signingMode?: string
    status?: string
  }
  evaluation: VerificationEvaluationParams
  signers: Array<{
    signerId?: string
    id?: string
    name: string
    email: string
    valid: boolean
  }>
  audit: {
    merkleRoot?: string | null
    totalEntries?: number
    latestEntryHash?: string
  }
}

export function buildVerificationCertificate({
  doc,
  evaluation,
  signers,
  audit,
}: CertificateBuildParams) {
  const tampered = deriveTamperedStatus(evaluation)

  return {
    certificateId: 'cert_' + Math.random().toString(36).substring(2, 12),
    issuedAt: new Date().toISOString(),
    service: 'ZK Doc Signer — Cryptographic Verification Engine',
    document: {
      id: doc.id,
      name: doc.name,
      sha256Hash: doc.sha256Hash,
      mimeType: doc.mimeType || 'application/octet-stream',
      signingMode: doc.signingMode || 'parallel',
      status: doc.status || 'pending',
    },
    verificationSummary: {
      tampered,
      allSignaturesValid: evaluation.allSignaturesValid,
      auditChainValid: evaluation.auditChainValid,
      fileHashMatch: evaluation.fileHashMatch,
    },
    signers: signers.map((s) => ({
      signerId: s.signerId || s.id || '',
      name: s.name,
      email: s.email,
      valid: s.valid,
    })),
    auditProof: {
      merkleRoot: audit.merkleRoot || null,
      totalAuditEntries: audit.totalEntries || 0,
      latestEntryHash: audit.latestEntryHash || null,
    },
  }
}
