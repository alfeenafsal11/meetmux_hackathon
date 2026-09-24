'use client'

import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { SignerQueue } from '@/components/SignerQueue'
import { ZKProveModal } from '@/components/ZKProveModal'

export default function SignDocumentPage() {
  const params = useParams()
  const docId = params.docId as string

  const [doc, setDoc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusMsg, setStatusMsg] = useState('')

  // Signer inputs
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [publicKeyPem, setPublicKeyPem] = useState('')
  const [privateKeyPem, setPrivateKeyPem] = useState('')
  const [keyPairGenerated, setKeyPairGenerated] = useState(false)

  // ZK modal state
  const [isZkModalOpen, setIsZkModalOpen] = useState(false)
  const [zkVerifiedProof, setZkVerifiedProof] = useState<any>(null)

  // Fetch document details
  const fetchDoc = async () => {
    try {
      const res = await fetch(`/api/documents/${docId}`)
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to load document')
      }
      setDoc(json.data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (docId) fetchDoc()
  }, [docId])

  // Generate WebCrypto ECDSA P-256 key pair in-browser
  const handleGenerateKeys = async () => {
    try {
      const kp = await window.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
      )
      const spki = await window.crypto.subtle.exportKey('spki', kp.publicKey)
      const pkcs8 = await window.crypto.subtle.exportKey('pkcs8', kp.privateKey)

      const pubB64 = btoa(String.fromCharCode(...new Uint8Array(spki)))
        .match(/.{1,64}/g)
        ?.join('\n')
      const privB64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)))
        .match(/.{1,64}/g)
        ?.join('\n')

      const pubPemFormatted = `-----BEGIN PUBLIC KEY-----\n${pubB64}\n-----END PUBLIC KEY-----\n`
      const privPemFormatted = `-----BEGIN PRIVATE KEY-----\n${privB64}\n-----END PRIVATE KEY-----\n`

      setPublicKeyPem(pubPemFormatted)
      setPrivateKeyPem(privPemFormatted)
      setKeyPairGenerated(true)
      setStatusMsg('New ECDSA P-256 key pair generated securely in your browser!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError('Key generation error: ' + msg)
    }
  }

  // Handle standard document signing (hash sign)
  const handleSignDocument = async () => {
    if (!signerName || !signerEmail || !publicKeyPem || !privateKeyPem) {
      setError('Please provide your name, email, and generate/paste keys before signing.')
      return
    }

    setError('')
    setStatusMsg('Signing document hash with ECDSA P-256...')

    try {
      // 1. Sign doc.sha256Hash locally using private key in browser
      const cleanPrivHex = privateKeyPem
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\s+/g, '')
      const privDer = Uint8Array.from(atob(cleanPrivHex), (c) => c.charCodeAt(0))

      const cryptoKey = await window.crypto.subtle.importKey(
        'pkcs8',
        privDer,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
      )

      const hashBytes = Uint8Array.from(
        doc.sha256Hash.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)),
      )
      const sigBuf = await window.crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        cryptoKey,
        hashBytes,
      )
      const signatureHex = Array.from(new Uint8Array(sigBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      // 2. Submit signature to POST /api/documents/:id/sign
      const res = await fetch(`/api/documents/${docId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName,
          signerEmail,
          publicKeyPem,
          signatureHex,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Signing submission rejected by server')
      }

      setStatusMsg('Document signed successfully! Audit entry recorded.')
      fetchDoc()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    }
  }

  // Handle PDF Byte-Range Signing
  const handleSignPdf = async () => {
    if (!signerName || !signerEmail || !publicKeyPem || !privateKeyPem) {
      setError('Please provide your name, email, and keys.')
      return
    }

    setError('')
    setStatusMsg('1/3 Preparing PDF placeholder and computing /ByteRange hash...')

    try {
      // 1. GET /api/documents/:id/sign-pdf to prepare placeholder & get byteRangeHash
      const prepRes = await fetch(`/api/documents/${docId}/sign-pdf`)
      const prepJson = await prepRes.json()
      if (!prepRes.ok || !prepJson.ok) {
        throw new Error(prepJson.error || 'Failed to prepare PDF for signing')
      }
      const { byteRangeHashHex } = prepJson.data

      // 2. Sign byte-range hash locally
      setStatusMsg('2/3 Signing /ByteRange hash locally in browser...')
      const cleanPrivHex = privateKeyPem
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\s+/g, '')
      const privDer = Uint8Array.from(atob(cleanPrivHex), (c) => c.charCodeAt(0))

      const cryptoKey = await window.crypto.subtle.importKey(
        'pkcs8',
        privDer,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
      )

      const hashBytes = Uint8Array.from(
        byteRangeHashHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)),
      )
      const sigBuf = await window.crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        cryptoKey,
        hashBytes,
      )
      const signatureHex = Array.from(new Uint8Array(sigBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      // 3. POST /api/documents/:id/sign-pdf
      setStatusMsg('3/3 Embedding signature into PDF placeholder and finalizing...')
      const signRes = await fetch(`/api/documents/${docId}/sign-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName,
          signerEmail,
          publicKeyPem,
          signatureHex,
          byteRangeHashHex,
        }),
      })

      if (!signRes.ok) {
        const errJson = await signRes.json().catch(() => ({}))
        throw new Error(errJson.error || 'PDF signing failed on server')
      }

      // Download the signed PDF
      const pdfBlob = await signRes.blob()
      const downloadUrl = URL.createObjectURL(pdfBlob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `signed-${doc.name || 'document'}.pdf`
      a.click()
      URL.revokeObjectURL(downloadUrl)

      setStatusMsg('PDF successfully signed and downloaded! Audit entry logged.')
      fetchDoc()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    }
  }

  if (loading) {
    return <div style={{ color: '#fff', padding: '40px' }}>Loading document...</div>
  }

  if (!doc) {
    return (
      <div style={{ color: '#fff', padding: '40px' }}>
        <h2>Document Not Found</h2>
        <Link href="/" style={{ color: '#818cf8' }}>← Back to Documents</Link>
      </div>
    )
  }

  const isPdf = doc.mimeType?.includes('pdf') || doc.name?.toLowerCase().endsWith('.pdf')

  return (
    <div style={pageStyle}>
      <header style={navHeaderStyle}>
        <div style={logoGroupStyle}>
          <span style={{ fontSize: '1.5rem' }}>🖋️</span>
          <div>
            <div style={logoTextStyle}>Signing Ceremony</div>
            <div style={taglineStyle}>NIST P-256 ECDSA & Zero-Knowledge Verification</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href="/" style={navLinkStyle}>← Dashboard</Link>
          <Link href={`/verify?docId=${doc.id}`} style={navLinkStyle}>View Verification</Link>
        </div>
      </header>

      <main style={mainContainerStyle}>
        <div style={gridStyle}>
          {/* Left Column: Signer Identity & Signing Action */}
          <div style={columnStyle}>
            <div style={cardStyle}>
              <h2 style={cardTitleStyle}>{doc.name}</h2>
              <div style={metaRowStyle}>
                <span style={{ color: '#9ca3af' }}>Document Hash:</span>
                <span style={monoStyle}>{doc.sha256Hash}</span>
              </div>
              <div style={{ ...metaRowStyle, marginTop: '4px' }}>
                <span style={{ color: '#9ca3af' }}>Signing Mode:</span>
                <span style={{ textTransform: 'capitalize', color: '#c084fc', fontWeight: 600 }}>
                  {doc.signingMode}
                </span>
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>Signer Information</h3>

              <div style={inputGroupStyle}>
                <label style={labelStyle}>Your Full Name:</label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="e.g. Alice Developer"
                  style={inputStyle}
                />
              </div>

              <div style={inputGroupStyle}>
                <label style={labelStyle}>Your Email Address:</label>
                <input
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder="alice@example.com"
                  style={inputStyle}
                />
              </div>

              {/* In-Browser Key Generation */}
              <div style={keySectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>ECDSA P-256 Key Pair</span>
                  <button onClick={handleGenerateKeys} style={keyGenButtonStyle}>
                    ⚡ Generate In-Browser Key
                  </button>
                </div>
                {keyPairGenerated && (
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#34d399' }}>
                    ✓ Private key held securely in browser memory (never uploaded)
                  </div>
                )}
              </div>

              {/* Zero-Knowledge Identification Ceremony */}
              <div style={zkSectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#c084fc' }}>
                      ZK Identity Proof (Schnorr)
                    </span>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
                      Prove key possession without revealing secret or signing hash
                    </div>
                  </div>
                  <button
                    onClick={() => setIsZkModalOpen(true)}
                    disabled={!privateKeyPem}
                    style={zkButtonStyle}
                  >
                    {zkVerifiedProof ? '✓ Identity Proved' : '🛡️ Prove Identity (ZK)'}
                  </button>
                </div>
                {zkVerifiedProof && (
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#a5b4fc' }}>
                    Challenge #{zkVerifiedProof.challengeId?.slice(0, 16)}... verified by server
                  </div>
                )}
              </div>

              {/* Messages */}
              {error && <div style={errorBannerStyle}>⚠️ {error}</div>}
              {statusMsg && <div style={statusBannerStyle}>ℹ️ {statusMsg}</div>}

              {/* Submit Buttons */}
              <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                {isPdf ? (
                  <button onClick={handleSignPdf} style={signPrimaryButtonStyle}>
                    📄 Sign PDF (Byte-Range) & Download
                  </button>
                ) : (
                  <button onClick={handleSignDocument} style={signPrimaryButtonStyle}>
                    🖋️ Cryptographically Sign Document
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Signer Queue */}
          <div style={columnStyle}>
            <SignerQueue
              signingMode={doc.signingMode}
              documentStatus={doc.status}
              signers={doc.signers || []}
              currentSignerEmail={signerEmail}
            />
          </div>
        </div>
      </main>

      {/* Interactive ZK Prove Modal */}
      <ZKProveModal
        isOpen={isZkModalOpen}
        onClose={() => setIsZkModalOpen(false)}
        docId={doc.id}
        publicKeyPem={publicKeyPem}
        onProofVerified={(proofData) => {
          setZkVerifiedProof(proofData)
          setIsZkModalOpen(false)
        }}
      />
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#090d16',
  color: '#f3f4f6',
  fontFamily: 'Inter, system-ui, sans-serif',
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

const mainContainerStyle: React.CSSProperties = {
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '32px 24px',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 1fr',
  gap: '24px',
}

const columnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.02)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '16px',
  padding: '24px',
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: 600,
  margin: '0 0 12px 0',
  color: '#ffffff',
}

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  fontSize: '0.85rem',
  alignItems: 'center',
}

const monoStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  color: '#818cf8',
}

const inputGroupStyle: React.CSSProperties = {
  marginBottom: '14px',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 500,
  color: '#d1d5db',
  marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
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

const keySectionStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '14px',
  borderRadius: '10px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
}

const keyGenButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  background: 'rgba(99, 102, 241, 0.2)',
  border: '1px solid rgba(99, 102, 241, 0.4)',
  color: '#a5b4fc',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const zkSectionStyle: React.CSSProperties = {
  marginTop: '12px',
  padding: '14px',
  borderRadius: '10px',
  background: 'rgba(168, 85, 247, 0.06)',
  border: '1px solid rgba(168, 85, 247, 0.2)',
}

const zkButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
  border: 'none',
  color: '#ffffff',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const signPrimaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 20px',
  borderRadius: '10px',
  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  border: 'none',
  color: '#ffffff',
  fontWeight: 600,
  fontSize: '0.95rem',
  cursor: 'pointer',
  boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)',
}

const errorBannerStyle: React.CSSProperties = {
  marginTop: '14px',
  padding: '10px 14px',
  borderRadius: '8px',
  background: 'rgba(239, 68, 68, 0.12)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  color: '#f87171',
  fontSize: '0.85rem',
}

const statusBannerStyle: React.CSSProperties = {
  marginTop: '14px',
  padding: '10px 14px',
  borderRadius: '8px',
  background: 'rgba(59, 130, 246, 0.12)',
  border: '1px solid rgba(59, 130, 246, 0.3)',
  color: '#60a5fa',
  fontSize: '0.85rem',
}
