'use client'

import React, { useState } from 'react'

export interface AuditEntryItem {
  id: string
  action: string
  signerId?: string | null
  timestamp: string
  prevHash?: string | null
  entryHash: string
}

export interface AuditTrailViewProps {
  docId: string
  entries: AuditEntryItem[]
  merkleRoot?: string | null
  chainValid: boolean
  onTamperSimulated?: () => void
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({
  docId,
  entries,
  merkleRoot,
  chainValid,
  onTamperSimulated,
}) => {
  const [tampering, setTampering] = useState(false)
  const [tamperMsg, setTamperMsg] = useState('')
  const isProduction = process.env.NODE_ENV === 'production'

  const handleSimulateTamper = async () => {
    if (entries.length === 0) return
    setTampering(true)
    setTamperMsg('')
    try {
      const res = await fetch('/api/audit/simulate-tamper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: entries[0].id,
          tamperedAction: 'tampered-' + entries[0].action,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setTamperMsg('Tampered entry #0 in database! Re-run verification to see instant detection.')
        if (onTamperSimulated) onTamperSimulated()
      } else {
        setTamperMsg('Failed: ' + json.error)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setTamperMsg('Error: ' + msg)
    } finally {
      setTampering(false)
    }
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Tamper-Evident Audit Trail</h3>
          <p style={subtitleStyle}>
            Cryptographic hash-chained log with Merkle tree anchoring
          </p>
        </div>
        <div style={chainStatusStyle(chainValid)}>
          {chainValid ? '✓ Hash-Chain Intact' : '⚠️ Hash-Chain Broken'}
        </div>
      </div>

      {merkleRoot && (
        <div style={merkleBoxStyle}>
          <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Merkle Tree Root:</span>
          <span style={hashStyle}>{merkleRoot}</span>
        </div>
      )}

      <div style={timelineStyle}>
        {entries.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>No audit entries recorded.</p>
        ) : (
          entries.map((entry, index) => {
            const isGenesis = index === 0
            return (
              <div key={entry.id} style={entryCardStyle}>
                <div style={entryHeaderStyle}>
                  <span style={actionBadgeStyle(entry.action)}>
                    #{index} {entry.action.toUpperCase()}
                  </span>
                  <span style={timeStyle}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>

                <div style={hashRowStyle}>
                  <span style={hashLabelStyle}>prevHash:</span>
                  <span style={hashValueStyle(isGenesis)}>
                    {entry.prevHash ? entry.prevHash.slice(0, 24) + '...' : '000000000000000000000000... (genesis)'}
                  </span>
                </div>

                <div style={hashRowStyle}>
                  <span style={hashLabelStyle}>entryHash:</span>
                  <span style={entryHashValueStyle}>
                    {entry.entryHash.slice(0, 32)}...
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {!isProduction && (
        <div style={devSectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={devTagStyle}>DEMO INTERACTIVE TOOL</span>
              <div style={{ fontSize: '0.82rem', color: '#9ca3af', marginTop: '4px' }}>
                Simulate an adversarial database mutation on log entry #0
              </div>
            </div>
            <button
              onClick={handleSimulateTamper}
              disabled={tampering || entries.length === 0}
              style={tamperButtonStyle}
            >
              {tampering ? 'Mutating DB...' : '⚡ Simulate Tamper in DB'}
            </button>
          </div>
          {tamperMsg && <div style={tamperAlertStyle}>{tamperMsg}</div>}
        </div>
      )}
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.03)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '14px',
  padding: '20px',
  color: '#f9fafb',
  fontFamily: 'Inter, system-ui, sans-serif',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: '16px',
}

const titleStyle: React.CSSProperties = {
  fontSize: '1.15rem',
  fontWeight: 600,
  margin: '0 0 4px 0',
  color: '#ffffff',
}

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  color: '#9ca3af',
  margin: 0,
}

const chainStatusStyle = (valid: boolean): React.CSSProperties => ({
  fontSize: '0.8rem',
  fontWeight: 600,
  padding: '4px 10px',
  borderRadius: '999px',
  background: valid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
  border: `1px solid ${valid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
  color: valid ? '#34d399' : '#f87171',
})

const merkleBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  alignItems: 'center',
  background: 'rgba(0, 0, 0, 0.25)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '8px',
  padding: '8px 12px',
  marginBottom: '16px',
}

const hashStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.82rem',
  color: '#c084fc',
}

const timelineStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  maxHeight: '340px',
  overflowY: 'auto',
  paddingRight: '4px',
}

const entryCardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  borderRadius: '8px',
  padding: '10px 12px',
}

const entryHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '6px',
}

const actionBadgeStyle = (action: string): React.CSSProperties => {
  const isUpload = action === 'upload'
  const isSign = action === 'sign'
  return {
    fontSize: '0.72rem',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '4px',
    background: isUpload
      ? 'rgba(59, 130, 246, 0.2)'
      : isSign
      ? 'rgba(16, 185, 129, 0.2)'
      : 'rgba(245, 158, 11, 0.2)',
    color: isUpload ? '#60a5fa' : isSign ? '#34d399' : '#fbbf24',
  }
}

const timeStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#9ca3af',
}

const hashRowStyle: React.CSSProperties = {
  display: 'flex',
  fontSize: '0.75rem',
  gap: '6px',
  marginTop: '3px',
}

const hashLabelStyle: React.CSSProperties = {
  color: '#6b7280',
  width: '65px',
}

const hashValueStyle = (isGenesis: boolean): React.CSSProperties => ({
  fontFamily: 'monospace',
  color: isGenesis ? '#6b7280' : '#a5b4fc',
})

const entryHashValueStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  color: '#818cf8',
}

const devSectionStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '12px 14px',
  borderRadius: '10px',
  background: 'rgba(239, 68, 68, 0.06)',
  border: '1px solid rgba(239, 68, 68, 0.2)',
}

const devTagStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  padding: '2px 6px',
  borderRadius: '4px',
  background: 'rgba(239, 68, 68, 0.2)',
  color: '#f87171',
}

const tamperButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  background: 'rgba(239, 68, 68, 0.2)',
  border: '1px solid rgba(239, 68, 68, 0.4)',
  color: '#fca5a5',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const tamperAlertStyle: React.CSSProperties = {
  marginTop: '10px',
  padding: '8px 10px',
  borderRadius: '6px',
  background: 'rgba(239, 68, 68, 0.15)',
  color: '#f87171',
  fontSize: '0.82rem',
}
