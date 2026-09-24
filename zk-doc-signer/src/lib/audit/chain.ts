/**
 * chain.ts — Audit chain verification
 *
 * Re-derives every entryHash from (prevHash, payload) and checks each
 * entry's stored hash matches the recomputed value.
 * Also checks that each entry's prevHash equals the previous entry's entryHash.
 */

import { computeEntryHash, canonicalJSON, GENESIS_HASH } from './log'
import type { AuditEntry } from '@prisma/client'

export interface ChainVerificationResult {
  valid: boolean
  totalEntries: number
  firstBadIndex?: number
  firstBadId?: string
  reason?: string
}

/**
 * Verify the full hash chain for an ordered list of audit entries.
 * Entries MUST be ordered by timestamp ascending (oldest first).
 */
export async function verifyChain(
  entries: AuditEntry[],
): Promise<ChainVerificationResult> {
  if (entries.length === 0) {
    return { valid: true, totalEntries: 0 }
  }

  let expectedPrevHash = GENESIS_HASH

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]

    // 1. Confirm prevHash linkage
    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        firstBadIndex: i,
        firstBadId: entry.id,
        reason: `Entry ${i} prevHash mismatch: expected ${expectedPrevHash}, got ${entry.prevHash}`,
      }
    }

    // 2. Re-derive entryHash from stored fields
    const payload: Record<string, unknown> = {
      action: entry.action,
      docId: entry.docId,
      signerId: entry.signerId ?? null,
      signature: entry.signature ?? null,
      timestamp: entry.timestamp.toISOString(),
      prevHash: entry.prevHash ?? GENESIS_HASH,
    }

    const recomputed = await computeEntryHash(expectedPrevHash, payload)

    if (recomputed !== entry.entryHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        firstBadIndex: i,
        firstBadId: entry.id,
        reason: `Entry ${i} entryHash mismatch: stored ${entry.entryHash}, recomputed ${recomputed}`,
      }
    }

    expectedPrevHash = entry.entryHash
  }

  return { valid: true, totalEntries: entries.length }
}
