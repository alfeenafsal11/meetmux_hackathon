/**
 * signerQueue.ts — Multi-party signing workflow logic
 *
 * Implements:
 *   1. Sequential signing: strictly ordered by `order` asc. Only the current
 *      active signer may sign. When signed, auto-advances to the next.
 *   2. Parallel signing: unordered set. Any pending signer may sign in any order.
 *   3. Document completion check: document is complete when all registered signers have signed.
 */

export interface QueueSigner {
  id: string
  name: string
  email: string
  order?: number | null
  status: string
  publicKey?: string
  signature?: string | null
  signedAt?: Date | string | null
}

export interface TurnValidationResult {
  allowed: boolean
  error?: string
  currentSigner?: QueueSigner
  matchedSigner?: QueueSigner
}

/**
 * Validates whether a specific signer is allowed to sign now.
 *
 * @param signingMode  'sequential' | 'parallel'
 * @param signers      List of signers registered for this document
 * @param target       Identifier of the signer attempting to sign (id or email)
 */
export function validateSignerTurn(
  signingMode: string,
  signers: QueueSigner[],
  target: { signerId?: string; signerEmail?: string },
): TurnValidationResult {
  // If no signers were pre-registered, ad-hoc signing is allowed
  if (signers.length === 0) {
    return { allowed: true }
  }

  // Find the target signer in the registered list
  const matched = signers.find((s) => {
    if (target.signerId && s.id === target.signerId) return true
    if (target.signerEmail && s.email.toLowerCase() === target.signerEmail.toLowerCase()) return true
    return false
  })

  if (!matched) {
    return {
      allowed: false,
      error: `Signer (${target.signerEmail ?? target.signerId ?? 'unknown'}) is not in the registered signer list for this document.`,
    }
  }

  if (matched.status === 'signed') {
    return {
      allowed: false,
      error: `Signer "${matched.name}" has already signed this document.`,
      matchedSigner: matched,
    }
  }

  // Sequential Mode: enforce order
  if (signingMode === 'sequential') {
    // Sort all signers by order ascending (defaulting nulls to Infinity)
    const sorted = [...signers].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
    const currentPending = sorted.find((s) => s.status === 'pending')

    if (currentPending && currentPending.id !== matched.id) {
      return {
        allowed: false,
        error: `Out-of-turn: It is currently ${currentPending.name}'s turn (order #${currentPending.order ?? 1}) to sign.`,
        currentSigner: currentPending,
        matchedSigner: matched,
      }
    }
  }

  // Parallel Mode: any pending signer is permitted
  return {
    allowed: true,
    matchedSigner: matched,
  }
}

/**
 * Returns true if all registered signers have signed (and there is at least one signer).
 */
export function checkAllSigned(signers: QueueSigner[]): boolean {
  if (signers.length === 0) return false
  return signers.every((s) => s.status === 'signed')
}

/**
 * Returns the currently active signer (for sequential mode) or undefined.
 */
export function getCurrentActiveSigner(
  signingMode: string,
  signers: QueueSigner[],
): QueueSigner | undefined {
  if (signingMode !== 'sequential') return undefined
  const sorted = [...signers].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
  return sorted.find((s) => s.status === 'pending')
}
