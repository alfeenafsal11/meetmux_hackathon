'use client'

import React, { useState } from 'react'
import { generateClientSchnorrProof } from '@/lib/zk/clientSchnorr'

export interface ZKProveModalProps {
  isOpen: boolean
  onClose: () => void
  docId: string
  publicKeyPem: string
  onProofVerified: (proofData: { challengeId: string; verifiedAt: string }) => void
}

export const ZKProveModal: React.FC<ZKProveModalProps> = ({
  isOpen,
  onClose,
  docId,
  publicKeyPem,
  onProofVerified,
}) => {
  const [step, setStep] = useState<'idle' | 'challenging' | 'proving' | 'verifying' | 'success' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [privateKeyPem, setPrivateKeyPem] = useState<string>('')

  if (!isOpen) return null

  const handleStartProof = async () => {
    if (!privateKeyPem.trim()) {
      setErrorMsg('Please paste or provide your private key PEM to compute the proof locally.')
      return
    }

    setErrorMsg('')
    try {
      // Step 1: Request Challenge from Server
      setStep('challenging')
      setStatusMsg('1/3 Requesting ephemeral challenge nonce from server...')
      const chalRes = await fetch('/api/zk/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId, publicKeyPem }),
      })
      const chalJson = await chalRes.json()
      if (!chalRes.ok || !chalJson.ok) {
        throw new Error(chalJson.error || 'Failed to acquire challenge')
      }
      const { challengeId, challengeNonce } = chalJson.data

      // Step 2: Compute Schnorr Proof entirely client-side in browser (ZK preserved)
      setStep('proving')
      setStatusMsg('2/3 Computing commitment R = k·G and response s = (k + e·x) mod n locally in browser...')
      const { commitmentHex, responseHex } = generateClientSchnorrProof(
        privateKeyPem,
        publicKeyPem,
        challengeNonce,
        docId,
      )

      // Step 3: Verify with Server
      setStep('verifying')
      setStatusMsg('3/3 Verifying identity proof against curve P-256 on server...')
      const verifyRes = await fetch('/api/zk/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          docId,
          publicKeyPem,
          commitmentHex,
          responseHex,
        }),
      })
      const verifyJson = await verifyRes.json()
      if (!verifyRes.ok || !verifyJson.ok) {
        throw new Error(verifyJson.error || 'Verification rejected by server')
      }

      setStep('success')
      setStatusMsg('Identity proof verified! Private key possession proved without revealing secret.')
      onProofVerified({ challengeId, verifiedAt: verifyJson.data.verifiedAt })
    } catch (err: unknown) {
      setStep('error')
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(msg)
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>Interactive Schnorr Identity Proof</h2>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        <p style={subtitleStyle}>
          Prove possession of the private key matching your registered public key on NIST P-256
          without revealing the key itself or producing a document signature.
        </p>

        <div style={infoBoxStyle}>
          <div><strong>Document ID:</strong> <span style={monoStyle}>{docId}</span></div>
          <div style={{ marginTop: '4px' }}>
            <strong>Protocol:</strong> Interactive Schnorr Identification (3-Move Sigma)
          </div>
        </div>

        {step === 'idle' || step === 'error' ? (
          <div>
            <label style={labelStyle}>Signer Private Key PEM (for proof computation):</label>
            <textarea
              rows={4}
              value={privateKeyPem}
              onChange={(e) => setPrivateKeyPem(e.target.value)}
              placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
              style={textareaStyle}
            />
            {errorMsg && <div style={errorBannerStyle}>{errorMsg}</div>}
            <div style={buttonRowStyle}>
              <button onClick={onClose} style={cancelButtonStyle}>Cancel</button>
              <button onClick={handleStartProof} style={proveButtonStyle}>
                Execute ZK Proof Protocol
              </button>
            </div>
          </div>
        ) : step === 'success' ? (
          <div>
            <div style={successBannerStyle}>
              <div style={{ fontSize: '1.4rem', marginBottom: '8px' }}>✓ Proof Validated</div>
              <div>{statusMsg}</div>
            </div>
            <div style={buttonRowStyle}>
              <button onClick={onClose} style={proveButtonStyle}>Continue</button>
            </div>
          </div>
        ) : (
          <div style={progressBoxStyle}>
            <div style={spinnerStyle} />
            <div style={{ marginTop: '12px', fontSize: '0.95rem' }}>{statusMsg}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
}

const modalStyle: React.CSSProperties = {
  background: '#111827',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '16px',
  width: '90%',
  maxWidth: '560px',
  padding: '24px',
  color: '#f9fafb',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '12px',
}

const titleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 600,
  margin: 0,
  color: '#ffffff',
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#9ca3af',
  fontSize: '1.5rem',
  cursor: 'pointer',
}

const subtitleStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '0.88rem',
  lineHeight: 1.4,
  margin: '0 0 16px 0',
}

const infoBoxStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '8px',
  padding: '12px 14px',
  fontSize: '0.82rem',
  color: '#d1d5db',
  marginBottom: '16px',
}

const monoStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  color: '#a5b4fc',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 500,
  marginBottom: '6px',
  color: '#e5e7eb',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '8px',
  color: '#f3f4f6',
  padding: '10px',
  fontSize: '0.8rem',
  fontFamily: 'monospace',
  boxSizing: 'border-box',
  resize: 'vertical',
  marginBottom: '12px',
}

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  marginTop: '16px',
}

const cancelButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '8px',
  background: 'transparent',
  border: '1px solid #4b5563',
  color: '#d1d5db',
  cursor: 'pointer',
  fontSize: '0.88rem',
}

const proveButtonStyle: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: '8px',
  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
  border: 'none',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '0.88rem',
  boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
}

const successBannerStyle: React.CSSProperties = {
  background: 'rgba(16, 185, 129, 0.12)',
  border: '1px solid rgba(16, 185, 129, 0.3)',
  borderRadius: '10px',
  padding: '20px',
  color: '#34d399',
  textAlign: 'center',
}

const errorBannerStyle: React.CSSProperties = {
  background: 'rgba(239, 68, 68, 0.12)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  borderRadius: '8px',
  padding: '10px 12px',
  color: '#f87171',
  fontSize: '0.85rem',
  marginBottom: '12px',
}

const progressBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '30px 16px',
  textAlign: 'center',
  color: '#a5b4fc',
}

const spinnerStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  border: '3px solid rgba(99, 102, 241, 0.2)',
  borderTopColor: '#6366f1',
  borderRadius: '50%',
}
