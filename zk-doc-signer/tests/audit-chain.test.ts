/**
 * Phase 2 — Audit Chain Tests
 *
 * Tests:
 *   1. appendAuditEntry chains correctly (prevHash linkage)
 *   2. verifyChain passes for a valid chain
 *   3. verifyChain detects a mutated entryHash (tamper)
 *   4. verifyChain detects a broken prevHash link
 *   5. computeMerkleRoot is stable for known inputs
 *   6. generateInclusionProof + verifyInclusionProof round-trip
 *   7. verifyInclusionProof fails if root is wrong
 */

import { describe, it, expect } from 'vitest'
import {
  computeEntryHash,
  canonicalJSON,
  GENESIS_HASH,
} from '@/lib/audit/log'
import { verifyChain } from '@/lib/audit/chain'
import {
  computeMerkleRoot,
  generateInclusionProof,
  verifyInclusionProof,
} from '@/lib/audit/merkle'
import { sha256String } from '@/lib/crypto/hash'
import type { AuditEntry } from '@prisma/client'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a fake AuditEntry row for testing without hitting the DB */
async function makeEntry(
  overrides: Partial<AuditEntry> & { prevHash: string; action: string },
): Promise<AuditEntry> {
  const base = {
    id: `test-${Math.random().toString(36).slice(2)}`,
    docId: 'doc-test',
    signerId: null,
    signature: null,
    timestamp: new Date('2026-01-01T00:00:00Z'),
    merkleRoot: null,
    ...overrides,
  }

  const payload: Record<string, unknown> = {
    action: base.action,
    docId: base.docId,
    signerId: base.signerId ?? null,
    signature: base.signature ?? null,
    timestamp: (base.timestamp as Date).toISOString(),
    prevHash: base.prevHash,
  }

  const entryHash = await computeEntryHash(base.prevHash, payload)
  return { ...base, entryHash } as AuditEntry
}

/** Build a valid chain of N entries */
async function buildChain(n: number): Promise<AuditEntry[]> {
  const entries: AuditEntry[] = []
  let prevHash = GENESIS_HASH
  for (let i = 0; i < n; i++) {
    const e = await makeEntry({
      prevHash,
      action: i === 0 ? 'upload' : 'sign',
      timestamp: new Date(`2026-01-01T00:00:0${i}Z`),
    })
    entries.push(e)
    prevHash = e.entryHash
  }
  return entries
}

// ── 1. canonicalJSON stability ───────────────────────────────────────────────

describe('canonicalJSON', () => {
  it('produces deterministic output regardless of key insertion order', () => {
    const a = canonicalJSON({ z: 1, a: 2, m: 3 })
    const b = canonicalJSON({ m: 3, z: 1, a: 2 })
    expect(a).toBe(b)
    expect(a).toBe('{"a":2,"m":3,"z":1}')
  })
})

// ── 2. computeEntryHash ──────────────────────────────────────────────────────

describe('computeEntryHash', () => {
  it('is deterministic for the same inputs', async () => {
    const payload = { action: 'upload', docId: 'doc-1', signerId: null, signature: null, timestamp: '2026-01-01T00:00:00.000Z', prevHash: GENESIS_HASH }
    const h1 = await computeEntryHash(GENESIS_HASH, payload)
    const h2 = await computeEntryHash(GENESIS_HASH, payload)
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(64)
  })

  it('changes when payload changes', async () => {
    const base = { action: 'upload', docId: 'doc-1', signerId: null, signature: null, timestamp: '2026-01-01T00:00:00.000Z', prevHash: GENESIS_HASH }
    const h1 = await computeEntryHash(GENESIS_HASH, { ...base, action: 'upload' })
    const h2 = await computeEntryHash(GENESIS_HASH, { ...base, action: 'sign' })
    expect(h1).not.toBe(h2)
  })
})

// ── 3. verifyChain — valid chain ─────────────────────────────────────────────

describe('verifyChain', () => {
  it('passes for an empty chain', async () => {
    const result = await verifyChain([])
    expect(result.valid).toBe(true)
    expect(result.totalEntries).toBe(0)
  })

  it('passes for a single-entry chain', async () => {
    const chain = await buildChain(1)
    const result = await verifyChain(chain)
    expect(result.valid).toBe(true)
  })

  it('passes for a 5-entry chain', async () => {
    const chain = await buildChain(5)
    const result = await verifyChain(chain)
    expect(result.valid).toBe(true)
    expect(result.totalEntries).toBe(5)
  })

  it('detects a mutated entryHash (direct tamper)', async () => {
    const chain = await buildChain(3)
    // Flip the entryHash of entry 1
    const tampered = [...chain]
    tampered[1] = { ...tampered[1], entryHash: 'dead'.repeat(16) }
    const result = await verifyChain(tampered)
    expect(result.valid).toBe(false)
    expect(result.firstBadIndex).toBe(1)
  })

  it('detects a mutated action field (content tamper)', async () => {
    const chain = await buildChain(3)
    // Change the action in entry 0 — entryHash stays the same → mismatch
    const tampered = [...chain]
    tampered[0] = { ...tampered[0], action: 'tampered-upload' }
    const result = await verifyChain(tampered)
    expect(result.valid).toBe(false)
    expect(result.firstBadIndex).toBe(0)
  })

  it('detects a broken prevHash link', async () => {
    const chain = await buildChain(3)
    // Break entry 2's prevHash
    const tampered = [...chain]
    tampered[2] = { ...tampered[2], prevHash: 'baad'.repeat(16) }
    const result = await verifyChain(tampered)
    expect(result.valid).toBe(false)
    expect(result.firstBadIndex).toBe(2)
  })
})

// ── 4. Merkle tree ───────────────────────────────────────────────────────────

describe('computeMerkleRoot', () => {
  it('returns GENESIS_HASH for empty list', async () => {
    const root = await computeMerkleRoot([])
    expect(root).toBe('0'.repeat(64))
  })

  it('returns the single leaf for a 1-element list', async () => {
    const leaf = await sha256String('only leaf')
    const root = await computeMerkleRoot([leaf])
    expect(root).toBe(leaf)
  })

  it('is deterministic for the same inputs', async () => {
    const leaves = ['aaaa', 'bbbb', 'cccc', 'dddd']
    const r1 = await computeMerkleRoot(leaves)
    const r2 = await computeMerkleRoot(leaves)
    expect(r1).toBe(r2)
  })

  it('changes when one leaf changes', async () => {
    const leaves = ['aaaa', 'bbbb', 'cccc', 'dddd']
    const r1 = await computeMerkleRoot(leaves)
    const modified = [...leaves]
    modified[2] = 'eeee'
    const r2 = await computeMerkleRoot(modified)
    expect(r1).not.toBe(r2)
  })

  it('handles odd-length lists (duplicate-last rule)', async () => {
    // 3 leaves → should not throw
    const root = await computeMerkleRoot(['aaaa', 'bbbb', 'cccc'])
    expect(root).toHaveLength(64)
  })
})

// ── 5. Inclusion proof ───────────────────────────────────────────────────────

describe('Merkle inclusion proof', () => {
  it('round-trips for every leaf in a 4-leaf tree', async () => {
    const leaves = ['aaaa', 'bbbb', 'cccc', 'dddd']
    for (let i = 0; i < leaves.length; i++) {
      const proof = await generateInclusionProof(leaves, i)
      const valid = await verifyInclusionProof(proof)
      expect(valid).toBe(true)
    }
  })

  it('round-trips for every leaf in a 5-leaf (odd) tree', async () => {
    const leaves = ['a', 'b', 'c', 'd', 'e']
    for (let i = 0; i < leaves.length; i++) {
      const proof = await generateInclusionProof(leaves, i)
      const valid = await verifyInclusionProof(proof)
      expect(valid).toBe(true)
    }
  })

  it('fails if the proof root is wrong', async () => {
    const leaves = ['aaaa', 'bbbb', 'cccc', 'dddd']
    const proof = await generateInclusionProof(leaves, 0)
    const tampered = { ...proof, root: 'dead'.repeat(16) }
    const valid = await verifyInclusionProof(tampered)
    expect(valid).toBe(false)
  })

  it('fails if the leaf hash is wrong', async () => {
    const leaves = ['aaaa', 'bbbb', 'cccc', 'dddd']
    const proof = await generateInclusionProof(leaves, 1)
    const tampered = { ...proof, leafHash: 'beef'.repeat(16) }
    const valid = await verifyInclusionProof(tampered)
    expect(valid).toBe(false)
  })
})
