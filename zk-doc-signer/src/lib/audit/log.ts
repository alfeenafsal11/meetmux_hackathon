/**
 * log.ts — Append-only audit log writer
 *
 * Each entry forms a hash chain:
 *   entryHash = SHA256(prevHash + canonicalJSON(entry_without_entryHash))
 *
 * The first entry uses prevHash = "0000...0000" (64 zeros).
 */

import { prisma } from '@/lib/db'
import { sha256String } from '@/lib/crypto/hash'
import type { AuditAction } from '@/types'

export const GENESIS_HASH = '0'.repeat(64)

// ── Canonical JSON ──────────────────────────────────────────────────────────

/**
 * Produce a deterministic JSON representation of an audit entry payload.
 * Keys are sorted alphabetically so serialisation is stable across runtimes.
 */
export function canonicalJSON(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort()
  const sorted: Record<string, unknown> = {}
  for (const k of sortedKeys) sorted[k] = obj[k]
  return JSON.stringify(sorted)
}

// ── Entry hash ──────────────────────────────────────────────────────────────

/**
 * Compute the entryHash for a log row.
 *
 * @param prevHash  hex SHA-256 of the previous entry (or GENESIS_HASH)
 * @param payload   the audit entry fields (without id and entryHash)
 */
export async function computeEntryHash(
  prevHash: string,
  payload: Record<string, unknown>,
): Promise<string> {
  return sha256String(prevHash + canonicalJSON(payload))
}

// ── Append ──────────────────────────────────────────────────────────────────

export interface AppendParams {
  docId: string
  signerId?: string
  action: AuditAction
  signature?: string
  merkleRoot?: string
}

/**
 * Append a new entry to the audit log for a document.
 * Fetches the last entry's hash to chain to, writes atomically.
 */
export async function appendAuditEntry(params: AppendParams) {
  const { docId, signerId, action, signature, merkleRoot } = params

  // Find the most recent entry for this document (or use genesis hash)
  const last = await prisma.auditEntry.findFirst({
    where: { docId },
    orderBy: { timestamp: 'desc' },
    select: { entryHash: true },
  })
  const prevHash = last?.entryHash ?? GENESIS_HASH

  const timestamp = new Date()

  // Build the payload that goes into the hash (id & entryHash excluded)
  const payload: Record<string, unknown> = {
    action,
    docId,
    signerId: signerId ?? null,
    signature: signature ?? null,
    timestamp: timestamp.toISOString(),
    prevHash,
  }

  const entryHash = await computeEntryHash(prevHash, payload)

  return prisma.auditEntry.create({
    data: {
      docId,
      signerId: signerId ?? null,
      action,
      signature: signature ?? null,
      timestamp,
      prevHash,
      entryHash,
      merkleRoot: merkleRoot ?? null,
    },
  })
}
