/**
 * Phase 6 — Verification Summary & Certificate Export Tests
 *
 * Tests:
 *   1. Consolidated "tampered: true/false" derivation logic:
 *      - All three valid -> tampered: false
 *      - fileHashMatch false in isolation -> tampered: true
 *      - allSignaturesValid false in isolation -> tampered: true
 *      - auditChainValid false in isolation -> tampered: true
 *      - Multiple failures -> tampered: true
 *   2. Verification Certificate export packaging:
 *      - Ensures certificate includes docId, sha256Hash, merkleRoot, signers, verificationSummary
 */

import { describe, it, expect } from 'vitest'
import {
  deriveTamperedStatus,
  buildVerificationCertificate,
} from '@/lib/verification/summary'

describe('Verification Summary: Tampered Badge Derivation', () => {
  it('reports untampered (tampered: false) when all three checks are true', () => {
    const tampered = deriveTamperedStatus({
      fileHashMatch: true,
      allSignaturesValid: true,
      auditChainValid: true,
    })
    expect(tampered).toBe(false)
  })

  it('reports untampered when fileHashMatch is null (no re-upload) and signatures + audit chain are valid', () => {
    const tampered = deriveTamperedStatus({
      fileHashMatch: null,
      allSignaturesValid: true,
      auditChainValid: true,
    })
    expect(tampered).toBe(false)
  })

  it('reports tampered: true when fileHashMatch is false in isolation', () => {
    const tampered = deriveTamperedStatus({
      fileHashMatch: false,
      allSignaturesValid: true,
      auditChainValid: true,
    })
    expect(tampered).toBe(true)
  })

  it('reports tampered: true when allSignaturesValid is false in isolation', () => {
    const tampered = deriveTamperedStatus({
      fileHashMatch: true,
      allSignaturesValid: false,
      auditChainValid: true,
    })
    expect(tampered).toBe(true)
  })

  it('reports tampered: true when auditChainValid is false in isolation', () => {
    const tampered = deriveTamperedStatus({
      fileHashMatch: true,
      allSignaturesValid: true,
      auditChainValid: false,
    })
    expect(tampered).toBe(true)
  })

  it('reports tampered: true when all three checks fail simultaneously', () => {
    const tampered = deriveTamperedStatus({
      fileHashMatch: false,
      allSignaturesValid: false,
      auditChainValid: false,
    })
    expect(tampered).toBe(true)
  })
})

describe('Verification Certificate Export Packaging', () => {
  const sampleDoc = {
    id: 'doc_cert_xyz789',
    name: 'Board Resolution.pdf',
    sha256Hash: '4a6f194c5a442a13b4867ee4b6d53a3e5aefa5f319a9f43acaf80298dc8526ba',
    signingMode: 'sequential',
    status: 'completed',
  }

  const sampleSigners = [
    { signerId: 's1', name: 'Alice Partner', email: 'alice@example.com', valid: true },
    { signerId: 's2', name: 'Bob Partner', email: 'bob@example.com', valid: true },
  ]

  const sampleAudit = {
    merkleRoot: 'c3ee8aba669f4c663bab83ad03eefeadae1234567890abcdef1234567890abcd',
    totalEntries: 3,
    latestEntryHash: '99ef602b1c4e7f8a9d0e1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e',
  }

  it('includes all mandatory certificate fields for untampered document', () => {
    const cert = buildVerificationCertificate({
      doc: sampleDoc,
      evaluation: { fileHashMatch: true, allSignaturesValid: true, auditChainValid: true },
      signers: sampleSigners,
      audit: sampleAudit,
    })

    // 1. Certificate envelope
    expect(cert.certificateId).toMatch(/^cert_/)
    expect(cert.issuedAt).toBeDefined()
    expect(cert.service).toContain('ZK Doc Signer')

    // 2. Document details (docId, hash)
    expect(cert.document.id).toBe('doc_cert_xyz789')
    expect(cert.document.name).toBe('Board Resolution.pdf')
    expect(cert.document.sha256Hash).toBe(sampleDoc.sha256Hash)
    expect(cert.document.status).toBe('completed')

    // 3. Verification summary
    expect(cert.verificationSummary.tampered).toBe(false)
    expect(cert.verificationSummary.allSignaturesValid).toBe(true)
    expect(cert.verificationSummary.auditChainValid).toBe(true)
    expect(cert.verificationSummary.fileHashMatch).toBe(true)

    // 4. Signers list
    expect(cert.signers).toHaveLength(2)
    expect(cert.signers[0].name).toBe('Alice Partner')
    expect(cert.signers[0].valid).toBe(true)
    expect(cert.signers[1].name).toBe('Bob Partner')

    // 5. Audit proof & Merkle root
    expect(cert.auditProof.merkleRoot).toBe(sampleAudit.merkleRoot)
    expect(cert.auditProof.totalAuditEntries).toBe(3)
    expect(cert.auditProof.latestEntryHash).toBe(sampleAudit.latestEntryHash)
  })

  it('correctly sets tampered: true on certificate when audit chain is compromised', () => {
    const cert = buildVerificationCertificate({
      doc: sampleDoc,
      evaluation: { fileHashMatch: true, allSignaturesValid: true, auditChainValid: false },
      signers: sampleSigners,
      audit: sampleAudit,
    })

    expect(cert.verificationSummary.tampered).toBe(true)
    expect(cert.verificationSummary.auditChainValid).toBe(false)
  })
})
