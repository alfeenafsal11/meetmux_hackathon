import React from 'react'

export interface SignerItem {
  id: string
  name: string
  email: string
  order?: number | null
  status: 'pending' | 'signed' | string
  signedAt?: string | Date | null
}

export interface SignerQueueProps {
  signingMode: 'sequential' | 'parallel' | string
  documentStatus: 'pending' | 'completed' | string
  signers: SignerItem[]
  currentSignerEmail?: string
}

export const SignerQueue: React.FC<SignerQueueProps> = ({
  signingMode,
  documentStatus,
  signers,
  currentSignerEmail,
}) => {
  // Determine who has the current turn if sequential
  const sortedSigners = [...signers].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  const currentTurnSigner =
    signingMode === 'sequential'
      ? sortedSigners.find((s) => s.status === 'pending')
      : null

  const isCompleted = documentStatus === 'completed' || signers.length > 0 && signers.every((s) => s.status === 'signed')

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Signer Queue</h3>
          <span style={modeBadgeStyle(signingMode)}>
            {signingMode === 'sequential' ? '⇄ Sequential Order' : '⇶ Parallel Any-Order'}
          </span>
        </div>
        <div style={statusBadgeStyle(isCompleted)}>
          {isCompleted ? '✓ Completed' : '● In Progress'}
        </div>
      </div>

      <div style={listStyle}>
        {sortedSigners.length === 0 ? (
          <p style={emptyStyle}>No signers assigned to this document.</p>
        ) : (
          sortedSigners.map((signer, index) => {
            const isSigned = signer.status === 'signed'
            const isCurrentTurn =
              signingMode === 'sequential' && currentTurnSigner?.id === signer.id
            const isYou =
              currentSignerEmail &&
              signer.email.toLowerCase() === currentSignerEmail.toLowerCase()

            return (
              <div
                key={signer.id || index}
                style={itemStyle(isSigned, isCurrentTurn)}
              >
                <div style={orderBadgeStyle(isSigned, isCurrentTurn)}>
                  {signingMode === 'sequential' ? `#${signer.order ?? index + 1}` : '•'}
                </div>

                <div style={infoStyle}>
                  <div style={nameRowStyle}>
                    <span style={nameStyle}>{signer.name}</span>
                    {isYou && <span style={youBadgeStyle}>You</span>}
                  </div>
                  <span style={emailStyle}>{signer.email}</span>
                  {isSigned && signer.signedAt && (
                    <span style={timestampStyle}>
                      Signed: {new Date(signer.signedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                <div style={stateBadgeStyle(isSigned, isCurrentTurn)}>
                  {isSigned ? (
                    '✓ Signed'
                  ) : isCurrentTurn ? (
                    '▶ Current Turn'
                  ) : signingMode === 'sequential' ? (
                    'Waiting'
                  ) : (
                    'Pending'
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {isCompleted && (
        <div style={completedBannerStyle}>
          All parties have cryptographically signed this document.
        </div>
      )}
    </div>
  )
}

// ── Styles (Vanilla CSS-in-JS for zero-dependency portability) ───────────────

const containerStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.03)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '12px',
  padding: '20px',
  color: '#f3f4f6',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: '16px',
}

const titleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 600,
  margin: '0 0 6px 0',
  color: '#ffffff',
}

const modeBadgeStyle = (mode: string): React.CSSProperties => ({
  fontSize: '0.75rem',
  padding: '2px 8px',
  borderRadius: '999px',
  background: mode === 'sequential' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(168, 85, 247, 0.15)',
  color: mode === 'sequential' ? '#818cf8' : '#c084fc',
  border: `1px solid ${mode === 'sequential' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(168, 85, 247, 0.3)'}`,
  fontWeight: 500,
})

const statusBadgeStyle = (completed: boolean): React.CSSProperties => ({
  fontSize: '0.8rem',
  fontWeight: 600,
  padding: '4px 10px',
  borderRadius: '999px',
  background: completed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
  color: completed ? '#34d399' : '#fbbf24',
  border: `1px solid ${completed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
})

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}

const itemStyle = (isSigned: boolean, isCurrent: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  padding: '12px 14px',
  borderRadius: '8px',
  background: isCurrent
    ? 'rgba(99, 102, 241, 0.1)'
    : isSigned
    ? 'rgba(16, 185, 129, 0.05)'
    : 'rgba(255, 255, 255, 0.02)',
  border: `1px solid ${
    isCurrent
      ? 'rgba(99, 102, 241, 0.4)'
      : isSigned
      ? 'rgba(16, 185, 129, 0.2)'
      : 'rgba(255, 255, 255, 0.05)'
  }`,
  transition: 'all 0.2s ease',
})

const orderBadgeStyle = (isSigned: boolean, isCurrent: boolean): React.CSSProperties => ({
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.8rem',
  fontWeight: 700,
  marginRight: '12px',
  flexShrink: 0,
  background: isSigned
    ? '#10b981'
    : isCurrent
    ? '#6366f1'
    : 'rgba(255, 255, 255, 0.1)',
  color: '#ffffff',
})

const infoStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
}

const nameRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
}

const nameStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '0.9rem',
  color: '#f9fafb',
}

const youBadgeStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  padding: '1px 6px',
  borderRadius: '4px',
  background: 'rgba(99, 102, 241, 0.3)',
  color: '#a5b4fc',
}

const emailStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#9ca3af',
}

const timestampStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#6ee7b7',
  marginTop: '2px',
}

const stateBadgeStyle = (isSigned: boolean, isCurrent: boolean): React.CSSProperties => ({
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '4px 8px',
  borderRadius: '6px',
  background: isSigned
    ? 'rgba(16, 185, 129, 0.2)'
    : isCurrent
    ? 'rgba(99, 102, 241, 0.25)'
    : 'rgba(255, 255, 255, 0.05)',
  color: isSigned ? '#34d399' : isCurrent ? '#a5b4fc' : '#6b7280',
})

const completedBannerStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '10px 14px',
  borderRadius: '8px',
  background: 'rgba(16, 185, 129, 0.12)',
  border: '1px solid rgba(16, 185, 129, 0.3)',
  color: '#6ee7b7',
  fontSize: '0.85rem',
  textAlign: 'center',
  fontWeight: 500,
}

const emptyStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '0.85rem',
  margin: 0,
}
