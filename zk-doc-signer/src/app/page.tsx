'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'

interface SignerInput {
  name: string
  email: string
  order: number
}

interface DocumentItem {
  id: string
  name: string
  sha256Hash: string
  mimeType: string
  signingMode: string
  status: string
  createdAt: string
  signers: Array<{ id: string; name: string; email: string; order?: number; status: string }>
}

export default function HomePage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(true)

  // Upload form state
  const [file, setFile] = useState<File | null>(null)
  const [docName, setDocName] = useState('')
  const [signingMode, setSigningMode] = useState<'parallel' | 'sequential'>('sequential')
  const [signers, setSigners] = useState<SignerInput[]>([
    { name: 'Alice Partner', email: 'alice@example.com', order: 1 },
    { name: 'Bob Partner', email: 'bob@example.com', order: 2 },
  ])
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents')
      const json = await res.json()
      if (json.ok) {
        setDocuments(json.data)
      }
    } catch (err) {
      console.error('Failed to fetch documents', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  const handleAddSigner = () => {
    setSigners((prev) => [
      ...prev,
      { name: '', email: '', order: prev.length + 1 },
    ])
  }

  const handleRemoveSigner = (idx: number) => {
    setSigners((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSignerChange = (idx: number, field: keyof SignerInput, value: string | number) => {
    setSigners((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    )
  }

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setUploadMsg('Please choose a file or PDF to upload.')
      return
    }

    setUploading(true)
    setUploadMsg('Uploading document and creating cryptographic record...')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', docName || file.name)
      formData.append('signingMode', signingMode)
      formData.append(
        'signers',
        JSON.stringify(signers.filter((s) => s.name.trim() && s.email.trim())),
      )

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Upload failed')
      }

      setUploadMsg(`Document "${json.data.name}" created successfully!`)
      setFile(null)
      setDocName('')
      fetchDocuments()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setUploadMsg('Error: ' + msg)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <div style={brandStyle}>
          <span style={{ fontSize: '1.8rem' }}>🔐</span>
          <div>
            <h1 style={titleStyle}>ZK Doc Signer</h1>
            <p style={subtitleStyle}>
              Zero-Knowledge Document Signing & Cryptographic Verification Platform
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href="/verify" style={verifyNavLinkStyle}>
            🛡️ Public Verification Dashboard
          </Link>
        </div>
      </header>

      {/* Main Grid */}
      <main style={mainContainerStyle}>
        <div style={dashboardGridStyle}>
          {/* Left Column: Upload & Configure */}
          <div style={cardStyle}>
            <h2 style={sectionHeadingStyle}>Upload New Document</h2>
            <p style={sectionSubStyle}>
              Upload a PDF or arbitrary file, select signing policy, and configure parties.
            </p>

            <form onSubmit={handleUploadSubmit}>
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Select File / PDF:</label>
                <input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null
                    setFile(f)
                    if (f && !docName) setDocName(f.name)
                  }}
                  style={fileInputStyle}
                />
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Document Display Name:</label>
                <input
                  type="text"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="e.g. Master Services Agreement"
                  style={textInputStyle}
                />
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Multi-Party Signing Policy:</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
                  <label style={radioLabelStyle}>
                    <input
                      type="radio"
                      name="signingMode"
                      value="sequential"
                      checked={signingMode === 'sequential'}
                      onChange={() => setSigningMode('sequential')}
                    />
                    <span>⇄ Sequential Order (Enforced Turn)</span>
                  </label>
                  <label style={radioLabelStyle}>
                    <input
                      type="radio"
                      name="signingMode"
                      value="parallel"
                      checked={signingMode === 'parallel'}
                      onChange={() => setSigningMode('parallel')}
                    />
                    <span>⇶ Parallel (Any Order)</span>
                  </label>
                </div>
              </div>

              {/* Signers Configuration */}
              <div style={signersSectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={labelStyle}>Registered Signers:</label>
                  <button type="button" onClick={handleAddSigner} style={addSignerButtonStyle}>
                    + Add Signer
                  </button>
                </div>

                {signers.map((s, idx) => (
                  <div key={idx} style={signerRowStyle}>
                    {signingMode === 'sequential' && (
                      <span style={orderBadgeStyle}>#{idx + 1}</span>
                    )}
                    <input
                      type="text"
                      placeholder="Name"
                      value={s.name}
                      onChange={(e) => handleSignerChange(idx, 'name', e.target.value)}
                      style={signerInputStyle}
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={s.email}
                      onChange={(e) => handleSignerChange(idx, 'email', e.target.value)}
                      style={signerInputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSigner(idx)}
                      style={removeButtonStyle}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {uploadMsg && <div style={msgBannerStyle}>{uploadMsg}</div>}

              <button type="submit" disabled={uploading} style={submitButtonStyle}>
                {uploading ? 'Creating Cryptographic Record...' : '🚀 Create Document Record'}
              </button>
            </form>
          </div>

          {/* Right Column: Recent Documents */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={sectionHeadingStyle}>Registered Documents</h2>
              <button onClick={fetchDocuments} style={refreshButtonStyle}>
                ↻ Refresh
              </button>
            </div>

            {loading ? (
              <p style={{ color: '#9ca3af' }}>Loading documents...</p>
            ) : documents.length === 0 ? (
              <p style={{ color: '#9ca3af' }}>No documents created yet.</p>
            ) : (
              <div style={docListStyle}>
                {documents.map((doc) => {
                  const isCompleted = doc.status === 'completed'
                  return (
                    <div key={doc.id} style={docCardStyle}>
                      <div style={docHeaderStyle}>
                        <div>
                          <div style={docNameStyle}>{doc.name}</div>
                          <div style={docMetaStyle}>
                            ID: <span style={monoStyle}>{doc.id.slice(0, 16)}...</span> • {new Date(doc.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <span style={statusBadgeStyle(isCompleted)}>
                          {isCompleted ? '✓ Completed' : '● Pending'}
                        </span>
                      </div>

                      <div style={docFooterStyle}>
                        <span style={policyPillStyle(doc.signingMode)}>
                          {doc.signingMode === 'sequential' ? 'Sequential' : 'Parallel'} ({doc.signers?.length || 0} signers)
                        </span>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Link href={`/sign/${doc.id}`} style={actionLinkStyle}>
                            🖋️ Sign
                          </Link>
                          <Link href={`/verify?docId=${doc.id}`} style={actionLinkSecondaryStyle}>
                            🛡️ Verify
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#090d16',
  color: '#f3f4f6',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '24px 36px',
  background: 'rgba(15, 23, 42, 0.7)',
  backdropFilter: 'blur(12px)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
}

const brandStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
}

const titleStyle: React.CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 700,
  margin: 0,
  color: '#ffffff',
}

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#9ca3af',
  margin: '2px 0 0 0',
}

const verifyNavLinkStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: '10px',
  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
  color: '#ffffff',
  textDecoration: 'none',
  fontSize: '0.9rem',
  fontWeight: 600,
  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
}

const mainContainerStyle: React.CSSProperties = {
  maxWidth: '1240px',
  margin: '0 auto',
  padding: '36px 24px',
}

const dashboardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.1fr 1fr',
  gap: '28px',
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.02)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '16px',
  padding: '26px',
}

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 600,
  margin: '0 0 6px 0',
  color: '#ffffff',
}

const sectionSubStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#9ca3af',
  margin: '0 0 20px 0',
}

const fieldGroupStyle: React.CSSProperties = {
  marginBottom: '16px',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 500,
  color: '#d1d5db',
  marginBottom: '6px',
}

const fileInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  borderRadius: '8px',
  background: '#131b2e',
  border: '1px dashed #334155',
  color: '#9ca3af',
  fontSize: '0.85rem',
  boxSizing: 'border-box',
}

const textInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '8px',
  background: '#131b2e',
  border: '1px solid #1e293b',
  color: '#f3f4f6',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
  outline: 'none',
}

const radioLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.82rem',
  color: '#d1d5db',
  cursor: 'pointer',
}

const signersSectionStyle: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.2)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  borderRadius: '10px',
  padding: '14px',
  marginBottom: '20px',
}

const addSignerButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#818cf8',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const signerRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  marginBottom: '8px',
}

const orderBadgeStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  color: '#a5b4fc',
  width: '24px',
}

const signerInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  borderRadius: '6px',
  background: '#0d1527',
  border: '1px solid #1e293b',
  color: '#f3f4f6',
  fontSize: '0.82rem',
  outline: 'none',
}

const removeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#ef4444',
  fontSize: '1.2rem',
  cursor: 'pointer',
  padding: '0 4px',
}

const submitButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  borderRadius: '10px',
  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  border: 'none',
  color: '#ffffff',
  fontWeight: 600,
  fontSize: '0.95rem',
  cursor: 'pointer',
  boxShadow: '0 2px 10px rgba(16, 185, 129, 0.25)',
}

const msgBannerStyle: React.CSSProperties = {
  padding: '10px',
  borderRadius: '8px',
  background: 'rgba(99, 102, 241, 0.15)',
  color: '#c7d2fe',
  fontSize: '0.85rem',
  marginBottom: '14px',
}

const refreshButtonStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '6px',
  color: '#9ca3af',
  padding: '4px 10px',
  fontSize: '0.8rem',
  cursor: 'pointer',
}

const docListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  maxHeight: '520px',
  overflowY: 'auto',
}

const docCardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '12px',
  padding: '14px 16px',
}

const docHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
}

const docNameStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '0.95rem',
  color: '#ffffff',
}

const docMetaStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#9ca3af',
  marginTop: '2px',
}

const monoStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  color: '#818cf8',
}

const statusBadgeStyle = (completed: boolean): React.CSSProperties => ({
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: '999px',
  background: completed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
  color: completed ? '#34d399' : '#fbbf24',
  border: `1px solid ${completed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
})

const docFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: '12px',
}

const policyPillStyle = (mode: string): React.CSSProperties => ({
  fontSize: '0.72rem',
  color: mode === 'sequential' ? '#818cf8' : '#c084fc',
})

const actionLinkStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  background: 'rgba(16, 185, 129, 0.15)',
  border: '1px solid rgba(16, 185, 129, 0.3)',
  color: '#6ee7b7',
  textDecoration: 'none',
  fontSize: '0.8rem',
  fontWeight: 600,
}

const actionLinkSecondaryStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  background: 'rgba(99, 102, 241, 0.15)',
  border: '1px solid rgba(99, 102, 241, 0.3)',
  color: '#a5b4fc',
  textDecoration: 'none',
  fontSize: '0.8rem',
  fontWeight: 600,
}
