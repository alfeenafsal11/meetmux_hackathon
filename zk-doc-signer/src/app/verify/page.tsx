'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { VerificationBadge } from '@/components/VerificationBadge'
import { SignerQueue } from '@/components/SignerQueue'
import { AuditTrailView } from '@/components/AuditTrailView'
import { deriveTamperedStatus, buildVerificationCertificate } from '@/lib/verification/summary'

function VerifyContent() {
  const searchParams = useSearchParams()
  const initialDocId = searchParams.get('docId') || ''

  const [docId, setDocId] = useState(initialDocId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Verification results
  const [docData, setDocData] = useState<any>(null)
  const [verifyData, setVerifyData] = useState<any>(null)
  const [auditData, setAuditData] = useState<any>(null)
  const [uploadedFileHash, setUploadedFileHash] = useState<string | null>(null)

  const runVerification = async (targetId: string, fileHashToCheck?: string) => {
    if (!targetId.trim()) return
    setLoading(true)
    setError('')
    try {
      // 1. Fetch document info
      const docRes = await fetch(`/api/documents/${targetId}`)
      const docJson = await docRes.json()
      if (!docRes.ok || !docJson.ok) {
        throw new Error(docJson.error || 'Document not found')
      }
      setDocData(docJson.data)

      // 2. Run signature verification
      const verifyRes = await fetch(`/api/documents/${targetId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileHash: fileHashToCheck || uploadedFileHash }),
      })
      const verifyJson = await verifyRes.json()
      setVerifyData(verifyJson.data)

      // 3. Fetch audit log & chain integrity
      const auditRes = await fetch(`/api/audit/${targetId}`)
      const auditJson = await auditRes.json()
      setAuditData(auditJson.data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setDocData(null)
      setVerifyData(null)
      setAuditData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialDocId) {
      runVerification(initialDocId)
    }
  }, [initialDocId])

  // Handle local file upload for tamper comparison
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const buffer = await file.arrayBuffer()
    const hashBuf = await crypto.subtle.digest('SHA-256', buffer)
    const hashHex = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    setUploadedFileHash(hashHex)

    if (docId) {
      runVerification(docId, hashHex)
    }
  }

  // Derive consolidated single "tampered" boolean using shared evaluation function
  const fileHashMatch = verifyData?.fileHashMatch ?? (uploadedFileHash ? false : true)
  const allSignaturesValid = verifyData?.allSignaturesValid ?? false
  const auditChainValid = auditData?.chainValid ?? false
  const isTampered = deriveTamperedStatus({
    fileHashMatch,
    allSignaturesValid,
    auditChainValid,
  })

  // Generate downloadable JSON certificate
  const handleDownloadCertificate = () => {
    if (!docData) return

    const certificate = buildVerificationCertificate({
      doc: docData,
      evaluation: { fileHashMatch, allSignaturesValid, auditChainValid },
      signers: verifyData?.signers || docData.signers || [],
      audit: {
        merkleRoot: auditData?.merkleRoot,
        totalEntries: auditData?.totalEntries,
        latestEntryHash: auditData?.entries?.[auditData.entries.length - 1]?.entryHash,
      },
    })

    const blob = new Blob([JSON.stringify(certificate, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `verification-certificate-${docData.name || docData.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={pageStyle}>
      {/* Navigation Header */}
      <header style={navHeaderStyle}>
        <div style={logoGroupStyle}>
          <span style={{ fontSize: '1.5rem' }}>🔐</span>
          <div>
            <div style={logoTextStyle}>ZK Doc Signer</div>
            <div style={taglineStyle}>Cryptographic Proof & Verification Dashboard</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href="/" style={navLinkStyle}>
            ← Documents
          </Link>
          {docData && (
            <Link href={`/sign/${docData.id}`} style={navLinkPrimaryStyle}>
              Open Signing Queue
            </Link>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main style={mainContainerStyle}>
        {/* Search / Document Lookup Card */}
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Verify Document Authenticity</h2>
          <p style={sectionSubtitleStyle}>
            Inspect ECDSA signatures, audit-chain integrity, and detect tampering live.
          </p>

          <div style={searchRowStyle}>
            <input
              type="text"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              placeholder="Paste Document ID (e.g. cmu...)"
              style={inputStyle}
            />
            <button
              onClick={() => runVerification(docId)}
              disabled={loading || !docId.trim()}
              style={searchButtonStyle}
            >
              {loading ? 'Verifying...' : 'Verify Document'}
            </button>
          </div>

          {/* Optional Local File Tamper Check */}
          <div style={fileUploadBoxStyle}>
            <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
              Optional tamper cross-check: Upload a local file to compare its SHA-256 hash
            </span>
            <input type="file" onChange={handleFileUpload} style={{ fontSize: '0.8rem', color: '#d1d5db' }} />
          </div>

          {error && <div style={errorBoxStyle}>⚠️ {error}</div>}
        </section>

        {/* Verification Results Dashboard */}
        {docData && (
          <div style={resultsGridStyle}>
            {/* Top Consolidated Status Banner */}
            <div style={fullWidthCardStyle}>
              <div style={statusBannerInnerStyle}>
                <div>
                  <h3 style={{ fontSize: '1.3rem', margin: '0 0 6px 0', color: '#ffffff' }}>
                    {docData.name}
                  </h3>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Doc ID:</span>
                    <span style={monoHashStyle}>{docData.id}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ color: '#9ca3af', fontSize: '0.82rem' }}>SHA-256:</span>
                    <span style={monoHashStyle}>{docData.sha256Hash}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
                  {/* Single clear consolidated tampered summary */}
                  <VerificationBadge
                    tampered={isTampered}
                    allSignaturesValid={allSignaturesValid}
                    auditChainValid={auditChainValid}
                    size="lg"
                  />
                  <button onClick={handleDownloadCertificate} style={downloadCertButtonStyle}>
                    📥 Download Verification Certificate (JSON)
                  </button>
                </div>
              </div>
            </div>

            {/* Left Column: Signer Queue & Signature Status */}
            <div style={columnStyle}>
              <SignerQueue
                signingMode={docData.signingMode}
                documentStatus={docData.status}
                signers={docData.signers || []}
              />

              {/* Signatures Detail List */}
              <div style={{ ...cardStyle, marginTop: '16px' }}>
                <h4 style={{ fontSize: '1rem', margin: '0 0 12px 0', color: '#ffffff' }}>
                  ECDSA P-256 Cryptographic Signatures
                </h4>
                {verifyData?.signers?.map((s: any, idx: number) => (
                  <div key={s.signerId || idx} style={signatureRowStyle}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{s.name}</div>
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{s.email}</div>
                    </div>
                    <div style={sigStatusBadgeStyle(s.valid)}>
                      {s.valid ? '✓ Signature Valid' : '⚠️ Invalid / Missing'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Audit Trail View with Live Break-it-Live Trigger */}
            <div style={columnStyle}>
              <AuditTrailView
                docId={docData.id}
                entries={auditData?.entries || []}
                merkleRoot={auditData?.merkleRoot}
                chainValid={auditChainValid}
                onTamperSimulated={() => runVerification(docData.id)}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div style={{ color: '#fff', padding: '40px' }}>Loading verification dashboard...</div>}>
      <VerifyContent />
    </Suspense>
  )
}

// ── Styles (Vanilla CSS-in-JS for zero-dependency portability) ───────────────

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#090d16',
  color: '#f3f4f6',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
}

const navHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 32px',
  background: 'rgba(15, 23, 42, 0.7)',
  backdropFilter: 'blur(12px)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
}

const logoGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
}

const logoTextStyle: React.CSSProperties = {
  fontSize: '1.15rem',
  fontWeight: 700,
  color: '#ffffff',
}

const taglineStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#9ca3af',
}

const navLinkStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: '8px',
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  color: '#d1d5db',
  textDecoration: 'none',
  fontSize: '0.85rem',
  fontWeight: 500,
}

const navLinkPrimaryStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: '8px',
  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
  color: '#ffffff',
  textDecoration: 'none',
  fontSize: '0.85rem',
  fontWeight: 600,
  boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
}

const mainContainerStyle: React.CSSProperties = {
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '32px 24px',
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.02)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '16px',
  padding: '24px',
  marginBottom: '24px',
}

const fullWidthCardStyle: React.CSSProperties = {
  gridColumn: '1 / -1',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '16px',
  padding: '24px',
}

const statusBannerInnerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '16px',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 700,
  margin: '0 0 6px 0',
  color: '#ffffff',
}

const sectionSubtitleStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '0.9rem',
  margin: '0 0 20px 0',
}

const searchRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 16px',
  borderRadius: '10px',
  background: '#131b2e',
  border: '1px solid #1e293b',
  color: '#f3f4f6',
  fontSize: '0.95rem',
  outline: 'none',
}

const searchButtonStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderRadius: '10px',
  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
  border: 'none',
  color: '#ffffff',
  fontWeight: 600,
  fontSize: '0.95rem',
  cursor: 'pointer',
  boxShadow: '0 2px 10px rgba(99, 102, 241, 0.3)',
}

const fileUploadBoxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: '16px',
  padding: '12px 16px',
  borderRadius: '10px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px dashed rgba(255, 255, 255, 0.1)',
}

const downloadCertButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: '8px',
  background: 'rgba(99, 102, 241, 0.15)',
  border: '1px solid rgba(99, 102, 241, 0.3)',
  color: '#a5b4fc',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const resultsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '24px',
}

const columnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const monoHashStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  color: '#818cf8',
}

const signatureRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 12px',
  borderRadius: '8px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  marginBottom: '8px',
}

const sigStatusBadgeStyle = (valid: boolean): React.CSSProperties => ({
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '4px 8px',
  borderRadius: '6px',
  background: valid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
  color: valid ? '#34d399' : '#f87171',
})

const errorBoxStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '12px',
  borderRadius: '8px',
  background: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  color: '#f87171',
  fontSize: '0.9rem',
}
