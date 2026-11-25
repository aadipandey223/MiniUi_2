/**
 * VaultBeam Triple-Layer Web Crypto Engine
 *
 * Layer 1 (Session):  Ephemeral AES-256-GCM key per transfer, fresh 96-bit IV per chunk,
 *                     and Associated Authenticated Data (AAD) binding (transferId + fileId + chunkIndex).
 * Layer 2 (Channel):  Private rooms wrap the L1 key with PBKDF2-SHA256 (310,000 iter) derived
 *                     AES-256-GCM room key (+ AAD); lobby transfers wrap L1 via ephemeral ECDH P-256.
 * Layer 3 (Identity): Non-extractable ECDSA P-256 signing keypair + sequential SHA-256
 *                     hash chain over every plaintext chunk, verified against pinned sender keys.
 */

const textEncoder = new TextEncoder();

export const PBKDF2_ITERATIONS = 310_000;

export interface LocalCryptoIdentity {
  signingKeyPair: CryptoKeyPair;
  ecdhKeyPair: CryptoKeyPair;
  signingPublicKeyBase64: string;
  ecdhPublicKeyBase64: string;
  fingerprint: string;
}

export interface CryptoSelfTestResult {
  passed: boolean;
  payloadBytes: number;
  chunkCount: number;
  durationMs: number;
  layer1Ok: boolean;
  layer2Ok: boolean;
  layer3SignatureOk: boolean;
  hashChainOk: boolean;
  tamperRejectedOk: boolean;
  chainRootPreview: string;
}

export function buildChunkAad(transferId: string, fileId: string, chunkIndex: number): Uint8Array<ArrayBuffer> {
  const encoded = textEncoder.encode(`vb:chunk:v3|${transferId}|${fileId}|${chunkIndex}`);
  const copy = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  copy.set(encoded);
  return copy;
}

export function buildKeyWrapAad(
  transferId: string,
  fileId: string,
  keyWrapMode: 'room' | 'ecdh'
): Uint8Array<ArrayBuffer> {
  const encoded = textEncoder.encode(`vb:wrap:v3|${transferId}|${fileId}|${keyWrapMode}`);
  const copy = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  copy.set(encoded);
  return copy;
}

export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, i + step);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Generate non-extractable ECDSA P-256 + ECDH P-256 device session identity */
export async function createLocalCryptoIdentity(): Promise<LocalCryptoIdentity> {
  const [signingKeyPair, ecdhKeyPair] = await Promise.all([
    crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, // non-extractable private key
      ['sign', 'verify']
    ),
    crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey']
    ),
  ]);

  const [signingSpki, ecdhSpki] = await Promise.all([
    crypto.subtle.exportKey('spki', signingKeyPair.publicKey),
    crypto.subtle.exportKey('spki', ecdhKeyPair.publicKey),
  ]);

  const digest = await crypto.subtle.digest('SHA-256', signingSpki);
  const fingerprint = bytesToHex(new Uint8Array(digest)).slice(0, 8).toUpperCase();

  return {
    signingKeyPair,
    ecdhKeyPair,
    signingPublicKeyBase64: arrayBufferToBase64(signingSpki),
    ecdhPublicKeyBase64: arrayBufferToBase64(ecdhSpki),
    fingerprint,
  };
}

/** Layer 1: Ephemeral AES-256-GCM session key */
export async function generateSessionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportRawKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', key);
}

export async function importSessionKey(rawKey: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptChunkAesGcm(
  chunk: ArrayBuffer,
  key: CryptoKey,
  additionalData?: Uint8Array<ArrayBuffer>
): Promise<{ ivBase64: string; ciphertextBase64: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const algorithm: AesGcmParams = additionalData
    ? { name: 'AES-GCM', iv, additionalData }
    : { name: 'AES-GCM', iv };
  const encrypted = await crypto.subtle.encrypt(algorithm, key, chunk);
  return {
    ivBase64: arrayBufferToBase64(iv),
    ciphertextBase64: arrayBufferToBase64(encrypted),
  };
}

export async function decryptChunkAesGcm(
  ciphertextBase64: string,
  ivBase64: string,
  key: CryptoKey,
  additionalData?: Uint8Array<ArrayBuffer>
): Promise<ArrayBuffer> {
  const iv = base64ToUint8Array(ivBase64);
  if (iv.byteLength !== 12) {
    throw new Error('Invalid AES-GCM nonce length.');
  }
  const ciphertext = base64ToUint8Array(ciphertextBase64);
  const algorithm: AesGcmParams = additionalData
    ? { name: 'AES-GCM', iv, additionalData }
    : { name: 'AES-GCM', iv };
  return crypto.subtle.decrypt(algorithm, key, ciphertext);
}

/** Layer 2A: Room encryption key (domain-separated PBKDF2-SHA256, 310,000 iterations) */
export async function deriveRoomKey(roomId: string, password: string): Promise<CryptoKey> {
  const normalizedId = roomId.toUpperCase();
  const secret = password ? `${normalizedId}:${password}` : normalizedId;
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const salt = await crypto.subtle.digest('SHA-256', textEncoder.encode(`vaultbeam-room-key:v2:${normalizedId}`));
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Zero-knowledge password verifier (domain-separated from room encryption key, 310,000 iterations) */
export async function derivePasswordVerifier(roomId: string, password: string): Promise<string> {
  const normalizedId = roomId.toUpperCase();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const salt = await crypto.subtle.digest('SHA-256', textEncoder.encode(`vaultbeam-auth-verifier:v2:${normalizedId}`));
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

/** Challenge-response proof: HMAC-SHA256(verifierBytes, challengeNonce) */
export async function computeChallengeProof(verifierHex: string, challengeNonce: string): Promise<string> {
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    hexToBytes(verifierHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', hmacKey, textEncoder.encode(challengeNonce));
  return bytesToHex(new Uint8Array(mac));
}

/** Layer 2B: Ephemeral ECDH P-256 shared wrapping key for lobby transfers */
export async function deriveEcdhWrappingKey(
  localPrivateKey: CryptoKey,
  remoteEcdhPublicKeyBase64: string
): Promise<CryptoKey> {
  const remoteKey = await crypto.subtle.importKey(
    'spki',
    base64ToUint8Array(remoteEcdhPublicKeyBase64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: remoteKey },
    localPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function wrapSessionKey(
  sessionKey: CryptoKey,
  wrappingKey: CryptoKey,
  additionalData?: Uint8Array<ArrayBuffer>
): Promise<{ wrappedKeyBase64: string; ivBase64: string }> {
  const rawSession = await exportRawKey(sessionKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const algorithm: AesGcmParams = additionalData
    ? { name: 'AES-GCM', iv, additionalData }
    : { name: 'AES-GCM', iv };
  const wrapped = await crypto.subtle.encrypt(algorithm, wrappingKey, rawSession);
  return {
    wrappedKeyBase64: arrayBufferToBase64(wrapped),
    ivBase64: arrayBufferToBase64(iv),
  };
}

export async function unwrapSessionKey(
  wrappedKeyBase64: string,
  ivBase64: string,
  wrappingKey: CryptoKey,
  additionalData?: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const iv = base64ToUint8Array(ivBase64);
  if (iv.byteLength !== 12) {
    throw new Error('Invalid key wrap nonce length.');
  }
  const algorithm: AesGcmParams = additionalData
    ? { name: 'AES-GCM', iv, additionalData }
    : { name: 'AES-GCM', iv };
  const rawSession = await crypto.subtle.decrypt(
    algorithm,
    wrappingKey,
    base64ToUint8Array(wrappedKeyBase64)
  );
  return importSessionKey(rawSession);
}

/** Layer 3: Streaming SHA-256 chunk hash chain */
export const GENESIS_HASH = '0'.repeat(64);

export async function advanceHashChain(previousHashHex: string, chunk: ArrayBuffer): Promise<string> {
  const prevBytes = textEncoder.encode(previousHashHex);
  const chunkBytes = new Uint8Array(chunk);
  const combined = new Uint8Array(prevBytes.length + chunkBytes.length);
  combined.set(prevBytes, 0);
  combined.set(chunkBytes, prevBytes.length);
  const digest = await crypto.subtle.digest('SHA-256', combined);
  return bytesToHex(new Uint8Array(digest));
}

export function buildCanonicalSignPayload(params: {
  transferId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  chainRootHex: string;
}): Uint8Array<ArrayBuffer> {
  const str = `vaultbeam:v3|${params.transferId}|${params.fileName}|${params.fileSize}|${params.totalChunks}|${params.chainRootHex}`;
  const encoded = textEncoder.encode(str);
  const copy = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  copy.set(encoded);
  return copy;
}

export async function signTransferRoot(
  payload: Uint8Array<ArrayBuffer>,
  privateKey: CryptoKey
): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    payload
  );
  return arrayBufferToBase64(signature);
}

export async function verifyTransferRoot(
  payload: Uint8Array<ArrayBuffer>,
  signatureBase64: string,
  senderSigningPublicKeyBase64: string
): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      'spki',
      base64ToUint8Array(senderSigningPublicKeyBase64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64ToUint8Array(signatureBase64),
      payload
    );
  } catch {
    return false;
  }
}

/** Cryptographically secure random password generator (uses Web Crypto, never Math.random) */
export function generateStrongPassword(length = 18): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*-_=+?';
  const all = upper + lower + digits + symbols;

  const pick = (charset: string): string => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return charset[buf[0] % charset.length];
  };

  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) {
    chars.push(pick(all));
  }

  // Fisher-Yates shuffle with CSPRNG
  const rand = new Uint32Array(chars.length);
  crypto.getRandomValues(rand);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function evaluatePasswordStrength(password: string): {
  score: number; // 0..4
  label: 'Empty' | 'Weak' | 'Fair' | 'Strong' | 'Fortified';
} {
  if (!password) return { score: 0, label: 'Empty' };
  let points = 0;
  if (password.length >= 8) points++;
  if (password.length >= 14) points++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points++;
  if (/\d/.test(password)) points++;
  if (/[^A-Za-z0-9]/.test(password)) points++;

  if (points <= 1) return { score: 1, label: 'Weak' };
  if (points === 2) return { score: 2, label: 'Fair' };
  if (points === 3 || points === 4) return { score: 3, label: 'Strong' };
  return { score: 4, label: 'Fortified' };
}

/** Live end-to-end cryptographic loopback self-test verifying all 3 layers, AAD binding, & tamper rejection */
export async function runCryptoSelfTest(
  localIdentity: LocalCryptoIdentity,
  roomKey: CryptoKey | null
): Promise<CryptoSelfTestResult> {
  const start = performance.now();
  const payloadBytes = 256 * 1024; // 256 KB test payload
  const chunkSize = 64 * 1024;
  const chunkCount = payloadBytes / chunkSize;
  const payload = new Uint8Array(payloadBytes);
  // Fill in 64KB slices (Web Crypto getRandomValues limit is 65536 bytes per call)
  for (let offset = 0; offset < payloadBytes; offset += 65536) {
    crypto.getRandomValues(payload.subarray(offset, offset + 65536));
  }

  // Layer 1 + Layer 2 with AAD binding
  const sessionKey = await generateSessionKey();
  const keyWrapMode: 'room' | 'ecdh' = roomKey ? 'room' : 'ecdh';
  const wrapAad = buildKeyWrapAad('self-test', 'loopback-file', keyWrapMode);
  let wrappingKey: CryptoKey;
  let unwrappingKey: CryptoKey;

  if (roomKey) {
    wrappingKey = roomKey;
    unwrappingKey = roomKey;
  } else {
    const peerIdentity = await createLocalCryptoIdentity();
    wrappingKey = await deriveEcdhWrappingKey(localIdentity.ecdhKeyPair.privateKey, peerIdentity.ecdhPublicKeyBase64);
    unwrappingKey = await deriveEcdhWrappingKey(peerIdentity.ecdhKeyPair.privateKey, localIdentity.ecdhPublicKeyBase64);
  }

  const wrapped = await wrapSessionKey(sessionKey, wrappingKey, wrapAad);
  const unwrappedKey = await unwrapSessionKey(wrapped.wrappedKeyBase64, wrapped.ivBase64, unwrappingKey, wrapAad);
  const layer2Ok = Boolean(unwrappedKey);

  // Encrypt & decrypt chunks with AAD while advancing sender + receiver SHA-256 hash chains
  let senderChain = GENESIS_HASH;
  let receiverChain = GENESIS_HASH;
  let layer1Ok = true;
  let firstEncrypted: { ivBase64: string; ciphertextBase64: string } | null = null;

  for (let i = 0; i < chunkCount; i++) {
    const slice = payload.slice(i * chunkSize, (i + 1) * chunkSize).buffer;
    const aad = buildChunkAad('self-test', 'loopback-file', i);
    senderChain = await advanceHashChain(senderChain, slice);
    const enc = await encryptChunkAesGcm(slice, sessionKey, aad);
    if (i === 0) firstEncrypted = enc;
    const dec = await decryptChunkAesGcm(enc.ciphertextBase64, enc.ivBase64, unwrappedKey, aad);
    receiverChain = await advanceHashChain(receiverChain, dec);

    const origView = new Uint8Array(slice);
    const decView = new Uint8Array(dec);
    if (origView.length !== decView.length || origView[0] !== decView[0] || origView[origView.length - 1] !== decView[decView.length - 1]) {
      layer1Ok = false;
    }
  }

  // Active tamper-rejection test: verify wrong AAD index AND flipped ciphertext byte both fail GCM auth
  let tamperRejectedOk = false;
  if (firstEncrypted) {
    let wrongIndexRejected = false;
    let flippedByteRejected = false;

    try {
      await decryptChunkAesGcm(
        firstEncrypted.ciphertextBase64,
        firstEncrypted.ivBase64,
        unwrappedKey,
        buildChunkAad('self-test', 'loopback-file', 99)
      );
    } catch {
      wrongIndexRejected = true;
    }

    try {
      const corrupted = base64ToUint8Array(firstEncrypted.ciphertextBase64);
      corrupted[0] ^= 0xff;
      await decryptChunkAesGcm(
        arrayBufferToBase64(corrupted),
        firstEncrypted.ivBase64,
        unwrappedKey,
        buildChunkAad('self-test', 'loopback-file', 0)
      );
    } catch {
      flippedByteRejected = true;
    }

    tamperRejectedOk = wrongIndexRejected && flippedByteRejected;
  }

  const hashChainOk = senderChain === receiverChain;
  const canonical = buildCanonicalSignPayload({
    transferId: 'self-test',
    fileName: 'loopback-verify.bin',
    fileSize: payloadBytes,
    totalChunks: chunkCount,
    chainRootHex: senderChain,
  });
  const sig = await signTransferRoot(canonical, localIdentity.signingKeyPair.privateKey);
  const layer3SignatureOk = await verifyTransferRoot(canonical, sig, localIdentity.signingPublicKeyBase64);

  return {
    passed: layer1Ok && layer2Ok && hashChainOk && layer3SignatureOk && tamperRejectedOk,
    payloadBytes,
    chunkCount,
    durationMs: Math.max(1, Math.round(performance.now() - start)),
    layer1Ok,
    layer2Ok,
    layer3SignatureOk,
    hashChainOk,
    tamperRejectedOk,
    chainRootPreview: senderChain.slice(0, 16).toUpperCase(),
  };
}
