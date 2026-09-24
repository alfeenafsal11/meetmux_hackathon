/**
 * Phase 4 — Multi-Party Signing Tests
 *
 * Covers:
 *   1. Queue logic unit tests (validateSignerTurn, checkAllSigned, getCurrentActiveSigner)
 *   2. Sequential signing flow:
 *      - 2-signer setup (Signer 1, Signer 2)
 *      - Signer 2 tries to sign out of turn -> rejected with error
 *      - Signer 1 signs -> auto-advances, Signer 1 signed, Signer 2 now current
 *      - Signer 2 signs -> both signed, document status becomes 'completed'
 *   3. Parallel signing flow:
 *      - 3-signer setup (unordered)
 *      - Signers sign in non-sequential order (e.g. 2, 3, 1) -> all succeed
 *      - Document becomes 'completed' once all 3 sign
 *   4. Edge cases:
 *      - Signer trying to sign twice is rejected
 *      - Unregistered signer on a pre-configured document is rejected
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  validateSignerTurn,
  checkAllSigned,
  getCurrentActiveSigner,
  QueueSigner,
} from '@/lib/multiParty/signerQueue'
import { prisma } from '@/lib/db'
import { sha256Hex } from '@/lib/crypto/hash'
import { generateWebCryptoKeyPair, exportPublicKeyToPem } from '@/lib/crypto/keys'
import { signHashHex } from '@/lib/crypto/ecdsa'

// ── 1. Unit Tests for Queue Logic ───────────────────────────────────────────

describe('Multi-Party Queue Logic (Unit)', () => {
  const alice: QueueSigner = {
    id: 's1',
    name: 'Alice',
    email: 'alice@example.com',
    order: 1,
    status: 'pending',
  }
  const bob: QueueSigner = {
    id: 's2',
    name: 'Bob',
    email: 'bob@example.com',
    order: 2,
    status: 'pending',
  }
  const carol: QueueSigner = {
    id: 's3',
    name: 'Carol',
    email: 'carol@example.com',
    order: 3,
    status: 'pending',
  }

  it('sequential: permits signer 1 first', () => {
    const res = validateSignerTurn('sequential', [alice, bob], { signerEmail: 'alice@example.com' })
    expect(res.allowed).toBe(true)
    expect(res.matchedSigner?.id).toBe('s1')
  })

  it('sequential: rejects signer 2 out-of-turn when signer 1 is pending', () => {
    const res = validateSignerTurn('sequential', [alice, bob], { signerEmail: 'bob@example.com' })
    expect(res.allowed).toBe(false)
    expect(res.error).toMatch(/out-of-turn/i)
    expect(res.currentSigner?.name).toBe('Alice')
  })

  it('sequential: permits signer 2 after signer 1 has signed', () => {
    const signedAlice = { ...alice, status: 'signed' }
    const res = validateSignerTurn('sequential', [signedAlice, bob], { signerEmail: 'bob@example.com' })
    expect(res.allowed).toBe(true)
    expect(res.matchedSigner?.id).toBe('s2')
  })

  it('parallel: permits any pending signer regardless of order', () => {
    const resBob = validateSignerTurn('parallel', [alice, bob, carol], { signerEmail: 'bob@example.com' })
    expect(resBob.allowed).toBe(true)

    const resCarol = validateSignerTurn('parallel', [alice, bob, carol], { signerEmail: 'carol@example.com' })
    expect(resCarol.allowed).toBe(true)
  })

  it('rejects a signer who has already signed', () => {
    const signedAlice = { ...alice, status: 'signed' }
    const res = validateSignerTurn('sequential', [signedAlice, bob], { signerEmail: 'alice@example.com' })
    expect(res.allowed).toBe(false)
    expect(res.error).toMatch(/already signed/i)
  })

  it('rejects an unregistered signer when signers are configured', () => {
    const res = validateSignerTurn('sequential', [alice, bob], { signerEmail: 'eve@example.com' })
    expect(res.allowed).toBe(false)
    expect(res.error).toMatch(/not in the registered signer list/i)
  })

  it('checkAllSigned detects complete and incomplete sets', () => {
    expect(checkAllSigned([alice, bob])).toBe(false)
    expect(checkAllSigned([{ ...alice, status: 'signed' }, bob])).toBe(false)
    expect(checkAllSigned([{ ...alice, status: 'signed' }, { ...bob, status: 'signed' }])).toBe(true)
  })

  it('getCurrentActiveSigner returns next pending in order', () => {
    expect(getCurrentActiveSigner('sequential', [alice, bob])?.name).toBe('Alice')
    expect(getCurrentActiveSigner('sequential', [{ ...alice, status: 'signed' }, bob])?.name).toBe('Bob')
    expect(getCurrentActiveSigner('sequential', [{ ...alice, status: 'signed' }, { ...bob, status: 'signed' }])).toBeUndefined()
    expect(getCurrentActiveSigner('parallel', [alice, bob])).toBeUndefined()
  })
})

// ── 2. End-to-End Multi-Party Signing Flow via DB / API logic ───────────────

describe('Multi-Party Signing Flow (End-to-End)', () => {
  let docHash: string

  beforeEach(async () => {
    docHash = await sha256Hex(new TextEncoder().encode('Multi-party contract test content ' + Date.now()))
  })

  it('2-signer sequential flow enforces order, auto-advances, and completes', async () => {
    // 1. Create document with 2 sequential signers
    const doc = await prisma.document.create({
      data: {
        name: 'sequential-contract.pdf',
        sha256Hash: docHash,
        signingMode: 'sequential',
        status: 'pending',
        signers: {
          create: [
            { name: 'Alice Sequential', email: 'alice.seq@example.com', order: 1, status: 'pending' },
            { name: 'Bob Sequential', email: 'bob.seq@example.com', order: 2, status: 'pending' },
          ],
        },
      },
      include: { signers: { orderBy: { order: 'asc' } } },
    })

    // 2. Generate keys for Alice & Bob
    const aliceKeys = await generateWebCryptoKeyPair(true)
    const alicePubPem = await exportPublicKeyToPem(aliceKeys.publicKey)

    const bobKeys = await generateWebCryptoKeyPair(true)
    const bobPubPem = await exportPublicKeyToPem(bobKeys.publicKey)

    // 3. Bob attempts to sign out of turn -> must be rejected
    const bobTurn = validateSignerTurn(doc.signingMode, doc.signers, { signerEmail: 'bob.seq@example.com' })
    expect(bobTurn.allowed).toBe(false)
    expect(bobTurn.error).toContain('Alice Sequential')

    // 4. Alice signs
    const aliceTurn = validateSignerTurn(doc.signingMode, doc.signers, { signerEmail: 'alice.seq@example.com' })
    expect(aliceTurn.allowed).toBe(true)

    // Server-side helper or direct signHashHex
    const { generateServerKeyPair } = await import('@/lib/crypto/keys')
    const aliceServerKp = generateServerKeyPair()
    const aliceSigHex = await signHashHex(aliceServerKp.privateKeyPem, docHash)

    await prisma.signer.update({
      where: { id: aliceTurn.matchedSigner!.id },
      data: {
        publicKey: aliceServerKp.publicKeyPem,
        signature: aliceSigHex,
        signedAt: new Date(),
        status: 'signed',
      },
    })

    // 5. Query updated state: doc is still pending, but Bob is now next
    let updatedDoc = await prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
      include: { signers: { orderBy: { order: 'asc' } } },
    })
    expect(updatedDoc.status).toBe('pending')
    const next = getCurrentActiveSigner(updatedDoc.signingMode, updatedDoc.signers)
    expect(next?.email).toBe('bob.seq@example.com')

    // 6. Now Bob signs
    const bobTurnAfterAlice = validateSignerTurn(updatedDoc.signingMode, updatedDoc.signers, {
      signerEmail: 'bob.seq@example.com',
    })
    expect(bobTurnAfterAlice.allowed).toBe(true)

    const bobServerKp = generateServerKeyPair()
    const bobSigHex = await signHashHex(bobServerKp.privateKeyPem, docHash)

    await prisma.signer.update({
      where: { id: bobTurnAfterAlice.matchedSigner!.id },
      data: {
        publicKey: bobServerKp.publicKeyPem,
        signature: bobSigHex,
        signedAt: new Date(),
        status: 'signed',
      },
    })

    // 7. Check completion
    const finalSigners = await prisma.signer.findMany({ where: { documentId: doc.id } })
    const allSigned = checkAllSigned(finalSigners)
    expect(allSigned).toBe(true)

    await prisma.document.update({
      where: { id: doc.id },
      data: { status: 'completed' },
    })

    const finalDoc = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(finalDoc.status).toBe('completed')
  })

  it('3-signer parallel flow allows signing in arbitrary order and completes', async () => {
    // 1. Create document with 3 parallel signers
    const doc = await prisma.document.create({
      data: {
        name: 'board-resolution.pdf',
        sha256Hash: docHash,
        signingMode: 'parallel',
        status: 'pending',
        signers: {
          create: [
            { name: 'Member A', email: 'member.a@example.com', status: 'pending' },
            { name: 'Member B', email: 'member.b@example.com', status: 'pending' },
            { name: 'Member C', email: 'member.c@example.com', status: 'pending' },
          ],
        },
      },
      include: { signers: true },
    })

    const { generateServerKeyPair } = await import('@/lib/crypto/keys')

    // Sign in order: Member B -> Member C -> Member A
    const signingSequence = ['member.b@example.com', 'member.c@example.com', 'member.a@example.com']

    for (let i = 0; i < signingSequence.length; i++) {
      const email = signingSequence[i]
      const currentSigners = await prisma.signer.findMany({ where: { documentId: doc.id } })
      const turn = validateSignerTurn(doc.signingMode, currentSigners, { signerEmail: email })
      expect(turn.allowed).toBe(true)

      const kp = generateServerKeyPair()
      const sig = await signHashHex(kp.privateKeyPem, docHash)

      await prisma.signer.update({
        where: { id: turn.matchedSigner!.id },
        data: {
          publicKey: kp.publicKeyPem,
          signature: sig,
          signedAt: new Date(),
          status: 'signed',
        },
      })

      const afterStepSigners = await prisma.signer.findMany({ where: { documentId: doc.id } })
      const isComplete = checkAllSigned(afterStepSigners)
      if (i < 2) {
        expect(isComplete).toBe(false)
      } else {
        expect(isComplete).toBe(true)
        await prisma.document.update({ where: { id: doc.id }, data: { status: 'completed' } })
      }
    }

    const finalDoc = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(finalDoc.status).toBe('completed')
  })
})
