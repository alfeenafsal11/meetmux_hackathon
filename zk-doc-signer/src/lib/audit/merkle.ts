/**
 * merkle.ts — Merkle tree over audit log entry hashes
 *
 * Simple binary Merkle tree: leaves are entryHash values.
 * Odd number of leaves: duplicate the last leaf.
 * Root is SHA256(left + right) at each level.
 *
 * Also provides inclusion proof generation and verification.
 */

import { sha256String } from '@/lib/crypto/hash'

// ── Tree construction ───────────────────────────────────────────────────────

/**
 * Compute the Merkle root of an ordered list of hex leaf hashes.
 * Returns the GENESIS_HASH if the list is empty.
 */
export async function computeMerkleRoot(leafHashes: string[]): Promise<string> {
  if (leafHashes.length === 0) return '0'.repeat(64)
  if (leafHashes.length === 1) return leafHashes[0]

  let level = [...leafHashes]

  while (level.length > 1) {
    const next: string[] = []
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]
      const right = level[i + 1] ?? left // duplicate last for odd-length
      next.push(await sha256String(left + right))
    }
    level = next
  }

  return level[0]
}

// ── Inclusion proof ─────────────────────────────────────────────────────────

export interface MerkleProofStep {
  sibling: string
  position: 'left' | 'right' // sibling's position relative to current node
}

export interface MerkleProof {
  leafHash: string
  leafIndex: number
  proof: MerkleProofStep[]
  root: string
}

/**
 * Generate an inclusion proof for the leaf at `leafIndex`.
 */
export async function generateInclusionProof(
  leafHashes: string[],
  leafIndex: number,
): Promise<MerkleProof> {
  if (leafHashes.length === 0) throw new Error('Empty leaf set')
  if (leafIndex < 0 || leafIndex >= leafHashes.length) {
    throw new Error(`Leaf index ${leafIndex} out of range`)
  }

  const proof: MerkleProofStep[] = []
  let level = [...leafHashes]
  let idx = leafIndex

  while (level.length > 1) {
    const next: string[] = []
    const nextLevel: string[] = []

    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]
      const right = level[i + 1] ?? left

      // If idx is in this pair, record the sibling
      if (i === idx || i + 1 === idx) {
        if (i === idx) {
          // We are the left node; sibling is right
          proof.push({ sibling: right, position: 'right' })
        } else {
          // We are the right node; sibling is left
          proof.push({ sibling: left, position: 'left' })
        }
      }

      nextLevel.push(await sha256String(left + right))
    }

    level = nextLevel
    idx = Math.floor(idx / 2)
  }

  return {
    leafHash: leafHashes[leafIndex],
    leafIndex,
    proof,
    root: level[0],
  }
}

/**
 * Verify a Merkle inclusion proof.
 * Returns true if the proof correctly reconstructs the given root.
 */
export async function verifyInclusionProof(proof: MerkleProof): Promise<boolean> {
  let current = proof.leafHash

  for (const step of proof.proof) {
    if (step.position === 'right') {
      // sibling is to the right: hash(current + sibling)
      current = await sha256String(current + step.sibling)
    } else {
      // sibling is to the left: hash(sibling + current)
      current = await sha256String(step.sibling + current)
    }
  }

  return current === proof.root
}
