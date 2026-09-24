/**
 * GET /api/audit/root
 *
 * Computes the global Merkle root over ALL audit entries (all documents),
 * ordered by timestamp ascending.
 *
 * Also signs the root with the server's ephemeral key so the root itself
 * is tamper-evident.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { computeMerkleRoot } from '@/lib/audit/merkle'
import { generateServerKeyPair } from '@/lib/crypto/keys'
import { signHashHex } from '@/lib/crypto/ecdsa'
import { sha256String } from '@/lib/crypto/hash'

// Ephemeral server key — in prod this would come from env / KMS
let _serverKeyPair: { privateKeyPem: string; publicKeyPem: string } | null = null
function getServerKey() {
  if (!_serverKeyPair) _serverKeyPair = generateServerKeyPair()
  return _serverKeyPair
}

export async function GET() {
  try {
    const entries = await prisma.auditEntry.findMany({
      orderBy: { timestamp: 'asc' },
      select: { entryHash: true },
    })

    const merkleRoot = await computeMerkleRoot(entries.map((e) => e.entryHash))
    const rootHash = await sha256String(merkleRoot)

    const { privateKeyPem, publicKeyPem } = getServerKey()
    const rootSignature = await signHashHex(privateKeyPem, rootHash)

    return NextResponse.json({
      ok: true,
      data: {
        totalEntries: entries.length,
        merkleRoot,
        rootHash,
        rootSignature,
        serverPublicKey: publicKeyPem,
        computedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('[GET /api/audit/root]', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
