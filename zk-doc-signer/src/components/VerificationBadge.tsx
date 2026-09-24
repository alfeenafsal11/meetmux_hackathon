import React from 'react'

export interface VerificationBadgeProps {
  tampered: boolean
  allSignaturesValid: boolean
  auditChainValid: boolean
  zkVerified?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  tampered,
  allSignaturesValid,
  auditChainValid,
  zkVerified,
  size = 'md',
}) => {
  const isClean = !tampered && allSignaturesValid && auditChainValid

  const sizeStyles = {
    sm: { padding: '4px 10px', fontSize: '0.75rem', iconSize: '14px' },
    md: { padding: '8px 16px', fontSize: '0.9rem', iconSize: '18px' },
    lg: { padding: '12px 24px', fontSize: '1.1rem', iconSize: '24px' },
  }[size]

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        borderRadius: '999px',
        fontWeight: 600,
        fontFamily: 'Inter, system-ui, sans-serif',
        ...sizeStyles,
        background: isClean ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
        border: `1.5px solid ${isClean ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
        color: isClean ? '#34d399' : '#f87171',
        boxShadow: isClean
          ? '0 0 15px rgba(16, 185, 129, 0.2)'
          : '0 0 15px rgba(239, 68, 68, 0.2)',
      }}
    >
      <span style={{ fontSize: sizeStyles.iconSize }}>
        {isClean ? '🛡️' : '⚠️'}
      </span>
      <span>
        {isClean ? 'CRYPTOGRAPHICALLY VERIFIED — UNTAMPERED' : 'TAMPER DETECTED — COMPROMISED'}
      </span>
      {zkVerified && (
        <span
          style={{
            marginLeft: '6px',
            padding: '2px 6px',
            fontSize: '0.7rem',
            background: 'rgba(99, 102, 241, 0.25)',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            borderRadius: '4px',
            color: '#a5b4fc',
          }}
        >
          ZK Proof ✓
        </span>
      )}
    </div>
  )
}
