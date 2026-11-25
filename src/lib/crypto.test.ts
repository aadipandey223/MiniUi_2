import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PBKDF2_ITERATIONS,
  buildChunkAad,
  buildKeyWrapAad,
  computeChallengeProof,
  createLocalCryptoIdentity,
  decryptChunkAesGcm,
  derivePasswordVerifier,
  deriveRoomKey,
  encryptChunkAesGcm,
  generateSessionKey,
  runCryptoSelfTest,
  unwrapSessionKey,
  wrapSessionKey,
} from './crypto.ts';

describe('VaultBeam hardened Web Crypto engine', () => {
  it('uses OWASP-grade 310,000 PBKDF2 iterations and produces consistent HMAC challenge proofs', async () => {
    assert.equal(PBKDF2_ITERATIONS, 310_000);
    const v1 = await derivePasswordVerifier('K9M4PX2QR', 'S+Tier!Secret99');
    const v2 = await derivePasswordVerifier('k9m4px2qr', 'S+Tier!Secret99');
    const vWrong = await derivePasswordVerifier('K9M4PX2QR', 'wrong-pass');

    assert.equal(v1.length, 64);
    assert.equal(v1, v2);
    assert.notEqual(v1, vWrong);

    const proof1 = await computeChallengeProof(v1, 'nonce-abc-123');
    const proof2 = await computeChallengeProof(v2, 'nonce-abc-123');
    const proofWrong = await computeChallengeProof(vWrong, 'nonce-abc-123');
    assert.equal(proof1, proof2);
    assert.notEqual(proof1, proofWrong);
  });

  it('binds chunks and wrapped keys to AAD and rejects reordered or cross-file decryption', async () => {
    const roomKey = await deriveRoomKey('AURUM7999', 'GoldVault!42');
    const sessionKey = await generateSessionKey();

    const wrapAad = buildKeyWrapAad('tx-1', 'file-a', 'room');
    const wrongWrapAad = buildKeyWrapAad('tx-1', 'file-b', 'room');
    const wrapped = await wrapSessionKey(sessionKey, roomKey, wrapAad);

    // Valid AAD unwraps cleanly
    const unwrapped = await unwrapSessionKey(wrapped.wrappedKeyBase64, wrapped.ivBase64, roomKey, wrapAad);
    assert.ok(unwrapped);

    // Mismatched AAD must fail
    await assert.rejects(() =>
      unwrapSessionKey(wrapped.wrappedKeyBase64, wrapped.ivBase64, roomKey, wrongWrapAad)
    );

    // Chunk encryption bound to index 0 must fail when decrypted as index 1
    const plain = new TextEncoder().encode('confidential mineral payload').buffer;
    const chunkAad0 = buildChunkAad('tx-1', 'file-a', 0);
    const chunkAad1 = buildChunkAad('tx-1', 'file-a', 1);
    const enc = await encryptChunkAesGcm(plain, sessionKey, chunkAad0);

    const dec = await decryptChunkAesGcm(enc.ciphertextBase64, enc.ivBase64, unwrapped, chunkAad0);
    assert.equal(new TextDecoder().decode(dec), 'confidential mineral payload');

    await assert.rejects(() =>
      decryptChunkAesGcm(enc.ciphertextBase64, enc.ivBase64, unwrapped, chunkAad1)
    );
  });

  it('passes full end-to-end loopback self-test including active tamper rejection', async () => {
    const identity = await createLocalCryptoIdentity();
    const result = await runCryptoSelfTest(identity, null);
    assert.equal(result.passed, true);
    assert.equal(result.layer1Ok, true);
    assert.equal(result.layer2Ok, true);
    assert.equal(result.layer3SignatureOk, true);
    assert.equal(result.hashChainOk, true);
    assert.equal(result.tamperRejectedOk, true);
  });
});
