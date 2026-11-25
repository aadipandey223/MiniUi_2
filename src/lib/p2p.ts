import type { SignalingTransport } from './signalingClient.ts';
import type {
  EncryptedChunkPacket,
  EncryptedManifest,
  TransferFinalizePacket,
  TransferTransport,
} from '../../shared/types.ts';
import {
  GENESIS_HASH,
  advanceHashChain,
  buildCanonicalSignPayload,
  buildChunkAad,
  buildKeyWrapAad,
  decryptChunkAesGcm,
  deriveEcdhWrappingKey,
  encryptChunkAesGcm,
  generateSessionKey,
  signTransferRoot,
  unwrapSessionKey,
  verifyTransferRoot,
  wrapSessionKey,
  type LocalCryptoIdentity,
} from './crypto.ts';
import { sanitizeDownloadFilename } from '../../shared/security.ts';

const CHUNK_SIZE = 48 * 1024; // 48 KB plaintext -> ~64 KB base64 JSON packet (safe for all WebRTC SCTP & Socket.IO)
const MAX_TRANSFER_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const WEBRTC_CONNECT_TIMEOUT_MS = 4500;
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 6,
};

type WireMessage =
  | { type: 'request'; transferId: string; fileId: string; receiverEcdhPublicKey: string }
  | { type: 'manifest'; manifest: EncryptedManifest }
  | { type: 'chunk'; packet: EncryptedChunkPacket }
  | { type: 'finalize'; finalize: TransferFinalizePacket }
  | { type: 'error'; transferId: string; message: string };

export interface UploadProgressInfo {
  transferId: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  targetPeerId: string;
  bytesSent: number;
  progress: number;
  speedBytesPerSec: number;
  transport: TransferTransport;
}

export interface DownloadProgressInfo {
  transferId: string;
  bytesReceived: number;
  totalBytes: number;
  progress: number;
  speedBytesPerSec: number;
  transport: TransferTransport;
  firstByteTime?: number;
}

export interface DownloadCompletedInfo {
  transferId: string;
  fileName: string;
  size: number;
  transport: TransferTransport;
  verified: boolean;
  durationSec: number;
  avgSpeedBytesPerSec: number;
}

export interface UploadCompletedInfo {
  transferId: string;
  fileName: string;
  size: number;
  transport: TransferTransport;
  durationSec: number;
  avgSpeedBytesPerSec: number;
}

interface TransferControllerDeps {
  socket: SignalingTransport;
  getIdentity: () => LocalCryptoIdentity | null;
  getRoomKey: () => CryptoKey | null;
  getLocalFile: (fileId: string) => File | undefined;
  onUploadProgress: (info: UploadProgressInfo) => void;
  onUploadComplete: (info: UploadCompletedInfo) => void;
  onUploadError: (transferId: string, message: string) => void;
}

interface ActiveDownloadContext {
  transferId: string;
  fileId: string;
  targetPeerId: string;
  expectedSenderSigningPublicKey?: string;
  expectedSenderEcdhPublicKey?: string;
  cancelled: boolean;
  pc: RTCPeerConnection | null;
  transport: TransferTransport;
  manifest: EncryptedManifest | null;
  sessionKey: CryptoKey | null;
  chunks: Map<number, ArrayBuffer>;
  receivedCount: number;
  bytesReceived: number;
  startTime: number;
  firstByteTime: number | null;
  lastProgressTime: number;
  lastProgressBytes: number;
  onProgress: (info: DownloadProgressInfo) => void;
  onVerifying: () => void;
  resolve: (result: DownloadCompletedInfo) => void;
  reject: (err: Error) => void;
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const safeName = sanitizeDownloadFilename(fileName);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 500);
}

async function waitForBufferDrain(dc: RTCDataChannel): Promise<void> {
  if (dc.bufferedAmount <= 512 * 1024) return;
  await new Promise<void>((resolve, reject) => {
    const onLow = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Data channel closed while sending.'));
    };
    const cleanup = () => {
      dc.removeEventListener('bufferedamountlow', onLow);
      dc.removeEventListener('close', onClose);
    };
    dc.bufferedAmountLowThreshold = 256 * 1024;
    dc.addEventListener('bufferedamountlow', onLow);
    dc.addEventListener('close', onClose);
  });
}

export class P2PTransferEngine {
  private deps: TransferControllerDeps;
  private senderConnections = new Map<string, RTCPeerConnection>();
  private activeDownloads = new Map<string, ActiveDownloadContext>();
  private cancelledUploads = new Set<string>();

  constructor(deps: TransferControllerDeps) {
    this.deps = deps;
    this.bindSocketSignaling();
  }

  private bindSocketSignaling() {
    const { socket } = this.deps;

    socket.on('webrtc:offer', async ({ fromPeerId, transferId, offer }: {
      fromPeerId: string;
      transferId: string;
      offer: RTCSessionDescriptionInit;
    }) => {
      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        this.senderConnections.set(transferId, pc);

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('webrtc:ice', { targetPeerId: fromPeerId, transferId, candidate: e.candidate });
          }
        };

        pc.ondatachannel = (event) => {
          const dc = event.channel;
          dc.onmessage = async (msgEvent) => {
            if (typeof msgEvent.data !== 'string') return;
            try {
              const msg = JSON.parse(msgEvent.data) as WireMessage;
              if (msg.type === 'request') {
                await this.streamEncryptedFile({
                  transferId: msg.transferId,
                  fileId: msg.fileId,
                  targetPeerId: fromPeerId,
                  receiverEcdhPublicKey: msg.receiverEcdhPublicKey,
                  transport: 'webrtc',
                  sendPacket: async (wireMsg) => {
                    if (dc.readyState !== 'open') {
                      throw new Error('Peer data channel closed.');
                    }
                    await waitForBufferDrain(dc);
                    dc.send(JSON.stringify(wireMsg));
                  },
                });
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Failed to stream file';
              if (dc.readyState === 'open') {
                dc.send(JSON.stringify({ type: 'error', transferId, message }));
              }
              this.deps.onUploadError(transferId, message);
            }
          };
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
            this.senderConnections.delete(transferId);
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', { targetPeerId: fromPeerId, transferId, answer });
      } catch (err) {
        console.error('Error handling WebRTC offer:', err);
      }
    });

    socket.on('webrtc:answer', async ({ transferId, answer }: {
      transferId: string;
      answer: RTCSessionDescriptionInit;
    }) => {
      const dl = this.activeDownloads.get(transferId);
      if (dl?.pc && dl.pc.signalingState === 'have-local-offer') {
        try {
          await dl.pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Error applying WebRTC answer:', err);
        }
      }
    });

    socket.on('webrtc:ice', async ({ transferId, candidate }: {
      transferId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const pc = this.activeDownloads.get(transferId)?.pc || this.senderConnections.get(transferId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Ignore late ICE candidates after fallback or teardown
        }
      }
    });

    // E2E-encrypted relay fallback: sender receives encrypted transfer request
    socket.on('relay:request', async ({ fromPeerId, transferId, fileId, receiverEcdhPublicKey }: {
      fromPeerId: string;
      transferId: string;
      fileId: string;
      receiverEcdhPublicKey: string;
    }) => {
      try {
        await this.streamEncryptedFile({
          transferId,
          fileId,
          targetPeerId: fromPeerId,
          receiverEcdhPublicKey,
          transport: 'relay',
          sendPacket: async (wireMsg) => {
            socket.emit('relay:packet', {
              targetPeerId: fromPeerId,
              transferId,
              packet: wireMsg,
            });
            // Yield gently to keep UI responsive & avoid saturating socket buffer
            await new Promise((r) => setTimeout(r, 4));
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Relay transfer failed';
        socket.emit('relay:packet', {
          targetPeerId: fromPeerId,
          transferId,
          packet: { type: 'error', transferId, message },
        });
        this.deps.onUploadError(transferId, message);
      }
    });

    // E2E-encrypted relay fallback: receiver handles incoming ciphertext frames
    socket.on('relay:packet', ({ transferId, packet }: { transferId: string; packet: WireMessage }) => {
      const dl = this.activeDownloads.get(transferId);
      if (dl && !dl.cancelled && dl.transport === 'relay') {
        void this.handleIncomingWireMessage(dl, packet);
      }
    });

    socket.on('relay:cancel', ({ transferId }: { transferId: string }) => {
      this.cancelledUploads.add(transferId);
      const pc = this.senderConnections.get(transferId);
      if (pc) {
        pc.close();
        this.senderConnections.delete(transferId);
      }
    });
  }

  public dispose() {
    for (const pc of this.senderConnections.values()) {
      pc.close();
    }
    this.senderConnections.clear();
    for (const dl of this.activeDownloads.values()) {
      dl.cancelled = true;
      dl.pc?.close();
    }
    this.activeDownloads.clear();
  }

  public cancelDownload(transferId: string) {
    const dl = this.activeDownloads.get(transferId);
    if (!dl) return;
    dl.cancelled = true;
    dl.pc?.close();
    this.deps.socket.emit('relay:cancel', { targetPeerId: dl.targetPeerId, transferId });
    this.activeDownloads.delete(transferId);
    dl.reject(new Error('Transfer cancelled'));
  }

  /** Sender: Triple-layer encrypt file in 48KB chunks, compute SHA-256 hash chain, and sign root */
  private async streamEncryptedFile(params: {
    transferId: string;
    fileId: string;
    targetPeerId: string;
    receiverEcdhPublicKey: string;
    transport: TransferTransport;
    sendPacket: (msg: WireMessage) => Promise<void>;
  }) {
    const { transferId, fileId, targetPeerId, receiverEcdhPublicKey, transport, sendPacket } = params;
    const identity = this.deps.getIdentity();
    if (!identity) throw new Error('Local cryptographic identity not initialized.');

    const file = this.deps.getLocalFile(fileId);
    if (!file) throw new Error('Requested file is no longer shared by sender.');

    const roomKey = this.deps.getRoomKey();
    const keyWrapMode: 'room' | 'ecdh' = roomKey ? 'room' : 'ecdh';
    const sessionKey = await generateSessionKey();
    const wrappingKey = roomKey
      ? roomKey
      : await deriveEcdhWrappingKey(identity.ecdhKeyPair.privateKey, receiverEcdhPublicKey);
    const wrapAad = buildKeyWrapAad(transferId, fileId, keyWrapMode);
    const wrapped = await wrapSessionKey(sessionKey, wrappingKey, wrapAad);

    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    const manifest: EncryptedManifest = {
      transferId,
      fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks,
      chunkSize: CHUNK_SIZE,
      keyWrapMode,
      wrappedSessionKey: wrapped.wrappedKeyBase64,
      wrappedSessionKeyIv: wrapped.ivBase64,
      senderEcdhPublicKey: identity.ecdhPublicKeyBase64,
      senderSigningPublicKey: identity.signingPublicKeyBase64,
      senderFingerprint: identity.fingerprint,
    };

    await sendPacket({ type: 'manifest', manifest });

    const startTime = Date.now();
    let lastReportTime = startTime;
    let lastReportBytes = 0;
    let bytesSent = 0;
    let chainHash = GENESIS_HASH;

    for (let index = 0; index < totalChunks; index++) {
      if (this.cancelledUploads.has(transferId)) {
        this.cancelledUploads.delete(transferId);
        return;
      }

      const startByte = index * CHUNK_SIZE;
      const endByte = Math.min(file.size, startByte + CHUNK_SIZE);
      const plainBuffer = file.size === 0 ? new ArrayBuffer(0) : await file.slice(startByte, endByte).arrayBuffer();

      // Layer 3: Advance SHA-256 hash chain over plaintext chunk
      chainHash = await advanceHashChain(chainHash, plainBuffer);

      // Layer 1: Encrypt chunk with ephemeral AES-256-GCM session key + AAD binding
      const chunkAad = buildChunkAad(transferId, fileId, index);
      const encrypted = await encryptChunkAesGcm(plainBuffer, sessionKey, chunkAad);
      await sendPacket({
        type: 'chunk',
        packet: {
          transferId,
          index,
          iv: encrypted.ivBase64,
          ciphertext: encrypted.ciphertextBase64,
        },
      });

      bytesSent = endByte;
      const now = Date.now();
      const elapsedSec = (now - lastReportTime) / 1000;
      if (elapsedSec >= 0.12 || index === totalChunks - 1) {
        const speed = elapsedSec > 0 ? (bytesSent - lastReportBytes) / elapsedSec : 0;
        this.deps.onUploadProgress({
          transferId,
          fileId,
          fileName: file.name,
          fileSize: file.size,
          targetPeerId,
          bytesSent,
          progress: file.size === 0 ? 100 : Math.min(100, (bytesSent / file.size) * 100),
          speedBytesPerSec: speed,
          transport,
        });
        lastReportTime = now;
        lastReportBytes = bytesSent;
      }
    }

    // Layer 3: Sign final hash chain root with ECDSA P-256
    const canonical = buildCanonicalSignPayload({
      transferId,
      fileName: file.name,
      fileSize: file.size,
      totalChunks,
      chainRootHex: chainHash,
    });
    const signature = await signTransferRoot(canonical, identity.signingKeyPair.privateKey);
    await sendPacket({
      type: 'finalize',
      finalize: {
        transferId,
        chainRootHex: chainHash,
        totalChunks,
        signature,
      },
    });

    const durationSec = Math.max(0.05, (Date.now() - startTime) / 1000);
    this.deps.onUploadComplete({
      transferId,
      fileName: file.name,
      size: file.size,
      transport,
      durationSec,
      avgSpeedBytesPerSec: file.size / durationSec,
    });
  }

  /** Receiver: Attempt direct WebRTC DataChannel first; transparently fall back to E2E-encrypted relay if NAT/iframe blocks ICE */
  public startDownload(params: {
    transferId: string;
    fileId: string;
    targetPeerId: string;
    expectedSenderSigningPublicKey?: string;
    expectedSenderEcdhPublicKey?: string;
    onProgress: (info: DownloadProgressInfo) => void;
    onVerifying: () => void;
  }): Promise<DownloadCompletedInfo> {
    const {
      transferId,
      fileId,
      targetPeerId,
      expectedSenderSigningPublicKey,
      expectedSenderEcdhPublicKey,
      onProgress,
      onVerifying,
    } = params;
    const identity = this.deps.getIdentity();
    if (!identity) {
      return Promise.reject(new Error('Local cryptographic identity is not ready.'));
    }

    return new Promise<DownloadCompletedInfo>((resolve, reject) => {
      const ctx: ActiveDownloadContext = {
        transferId,
        fileId,
        targetPeerId,
        expectedSenderSigningPublicKey,
        expectedSenderEcdhPublicKey,
        cancelled: false,
        pc: null,
        transport: 'webrtc',
        manifest: null,
        sessionKey: null,
        chunks: new Map(),
        receivedCount: 0,
        bytesReceived: 0,
        startTime: Date.now(),
        firstByteTime: null,
        lastProgressTime: Date.now(),
        lastProgressBytes: 0,
        onProgress,
        onVerifying,
        resolve,
        reject,
      };
      this.activeDownloads.set(transferId, ctx);

      let settledTransport = false;

      const switchToEncryptedRelay = () => {
        if (settledTransport || ctx.cancelled) return;
        settledTransport = true;
        ctx.transport = 'relay';
        if (ctx.pc) {
          ctx.pc.close();
          ctx.pc = null;
        }
        this.deps.socket.emit('relay:request', {
          targetPeerId,
          transferId,
          fileId,
          receiverEcdhPublicKey: identity.ecdhPublicKeyBase64,
        });
      };

      const fallbackTimer = window.setTimeout(() => {
        switchToEncryptedRelay();
      }, WEBRTC_CONNECT_TIMEOUT_MS);

      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        ctx.pc = pc;

        pc.onicecandidate = (e) => {
          if (e.candidate && !settledTransport) {
            this.deps.socket.emit('webrtc:ice', {
              targetPeerId,
              transferId,
              candidate: e.candidate,
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' && !settledTransport) {
            window.clearTimeout(fallbackTimer);
            switchToEncryptedRelay();
          }
        };

        const dc = pc.createDataChannel(`vb-${transferId}`, { ordered: true });

        dc.onopen = () => {
          if (settledTransport || ctx.cancelled) return;
          settledTransport = true;
          window.clearTimeout(fallbackTimer);
          ctx.transport = 'webrtc';
          const req: WireMessage = {
            type: 'request',
            transferId,
            fileId,
            receiverEcdhPublicKey: identity.ecdhPublicKeyBase64,
          };
          dc.send(JSON.stringify(req));
        };

        dc.onmessage = (event) => {
          if (typeof event.data !== 'string' || ctx.cancelled) return;
          try {
            const msg = JSON.parse(event.data) as WireMessage;
            void this.handleIncomingWireMessage(ctx, msg);
          } catch (err) {
            this.failDownload(ctx, err instanceof Error ? err.message : 'Corrupted packet');
          }
        };

        dc.onerror = () => {
          if (!settledTransport) {
            window.clearTimeout(fallbackTimer);
            switchToEncryptedRelay();
          }
        };

        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer).then(() => offer))
          .then((offer) => {
            if (!ctx.cancelled && !settledTransport) {
              this.deps.socket.emit('webrtc:offer', { targetPeerId, transferId, offer });
            }
          })
          .catch(() => {
            window.clearTimeout(fallbackTimer);
            switchToEncryptedRelay();
          });
      } catch {
        window.clearTimeout(fallbackTimer);
        switchToEncryptedRelay();
      }
    });
  }

  private async handleIncomingWireMessage(ctx: ActiveDownloadContext, msg: WireMessage) {
    if (ctx.cancelled) return;

    try {
      if (msg.type === 'error') {
        this.failDownload(ctx, msg.message || 'Sender reported a transfer error.');
        return;
      }

      if (msg.type === 'manifest') {
        const identity = this.deps.getIdentity();
        if (!identity) throw new Error('Local cryptographic identity missing.');
        if (ctx.manifest) throw new Error('Duplicate transfer manifest rejected.');

        const manifest = msg.manifest;
        if (manifest.transferId !== ctx.transferId || manifest.fileId !== ctx.fileId) {
          throw new Error('Transfer manifest identifier mismatch.');
        }
        if (
          !Number.isFinite(manifest.size) ||
          manifest.size < 0 ||
          manifest.size > MAX_TRANSFER_SIZE_BYTES ||
          !Number.isInteger(manifest.chunkSize) ||
          manifest.chunkSize <= 0 ||
          manifest.chunkSize > 1024 * 1024
        ) {
          throw new Error('Invalid file size or chunk geometry in transfer manifest.');
        }
        const expectedTotalChunks = Math.max(1, Math.ceil(manifest.size / manifest.chunkSize));
        if (!Number.isInteger(manifest.totalChunks) || manifest.totalChunks !== expectedTotalChunks) {
          throw new Error('Manifest chunk count does not match declared file size.');
        }

        // Pin sender public keys against authenticated peer registry to prevent MITM key substitution
        if (
          ctx.expectedSenderSigningPublicKey &&
          manifest.senderSigningPublicKey !== ctx.expectedSenderSigningPublicKey
        ) {
          throw new Error('Sender signing public key mismatch — potential MITM rejected.');
        }
        if (
          ctx.expectedSenderEcdhPublicKey &&
          manifest.senderEcdhPublicKey !== ctx.expectedSenderEcdhPublicKey
        ) {
          throw new Error('Sender ECDH public key mismatch — potential MITM rejected.');
        }

        const roomKey = this.deps.getRoomKey();
        if (roomKey && manifest.keyWrapMode !== 'room') {
          throw new Error('Private room downgrade attack rejected.');
        }

        ctx.manifest = manifest;

        // Layer 2: Unwrap Layer 1 session key using Room Key or ECDH shared secret + AAD
        let wrappingKey: CryptoKey;
        if (manifest.keyWrapMode === 'room') {
          if (!roomKey) throw new Error('Missing private room encryption key.');
          wrappingKey = roomKey;
        } else {
          wrappingKey = await deriveEcdhWrappingKey(
            identity.ecdhKeyPair.privateKey,
            manifest.senderEcdhPublicKey
          );
        }

        const wrapAad = buildKeyWrapAad(ctx.transferId, ctx.fileId, manifest.keyWrapMode);
        ctx.sessionKey = await unwrapSessionKey(
          manifest.wrappedSessionKey,
          manifest.wrappedSessionKeyIv,
          wrappingKey,
          wrapAad
        );
        return;
      }

      if (msg.type === 'chunk') {
        if (!ctx.manifest || !ctx.sessionKey) {
          throw new Error('Received encrypted chunk before transfer manifest.');
        }

        const { index } = msg.packet;
        if (
          msg.packet.transferId !== ctx.transferId ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= ctx.manifest.totalChunks
        ) {
          throw new Error('Out-of-bounds encrypted chunk index rejected.');
        }
        if (ctx.chunks.has(index)) {
          throw new Error(`Duplicate encrypted chunk #${index + 1} rejected.`);
        }

        // Layer 1: Decrypt chunk via AES-256-GCM with AAD bound to (transferId, fileId, index)
        const chunkAad = buildChunkAad(ctx.transferId, ctx.fileId, index);
        const plainBuffer = await decryptChunkAesGcm(
          msg.packet.ciphertext,
          msg.packet.iv,
          ctx.sessionKey,
          chunkAad
        );

        if (ctx.bytesReceived + plainBuffer.byteLength > ctx.manifest.size) {
          throw new Error('Decrypted payload exceeded declared file size.');
        }

        ctx.chunks.set(index, plainBuffer);
        ctx.receivedCount++;
        ctx.bytesReceived += plainBuffer.byteLength;

        const now = Date.now();
        if (ctx.firstByteTime === null) {
          ctx.firstByteTime = now;
        }

        const elapsed = (now - ctx.lastProgressTime) / 1000;
        if (elapsed >= 0.1 || ctx.receivedCount === ctx.manifest.totalChunks) {
          const speed = elapsed > 0 ? (ctx.bytesReceived - ctx.lastProgressBytes) / elapsed : 0;
          ctx.onProgress({
            transferId: ctx.transferId,
            bytesReceived: ctx.bytesReceived,
            totalBytes: ctx.manifest.size,
            progress:
              ctx.manifest.size === 0
                ? 100
                : Math.min(99, (ctx.bytesReceived / ctx.manifest.size) * 100),
            speedBytesPerSec: speed,
            transport: ctx.transport,
            firstByteTime: ctx.firstByteTime,
          });
          ctx.lastProgressTime = now;
          ctx.lastProgressBytes = ctx.bytesReceived;
        }
        return;
      }

      if (msg.type === 'finalize') {
        if (!ctx.manifest) {
          throw new Error('Missing manifest at transfer finalization.');
        }
        if (msg.finalize.transferId !== ctx.transferId || msg.finalize.totalChunks !== ctx.manifest.totalChunks) {
          throw new Error('Finalization metadata mismatch — transfer rejected.');
        }

        ctx.onVerifying();

        // Layer 3: Recompute full SHA-256 hash chain in order and verify ECDSA P-256 signature
        const orderedBuffers: ArrayBuffer[] = [];
        let totalAssembledBytes = 0;
        let computedChain = GENESIS_HASH;
        for (let i = 0; i < ctx.manifest.totalChunks; i++) {
          const chunk = ctx.chunks.get(i);
          if (!chunk) {
            throw new Error(`Missing encrypted chunk #${i + 1} of ${ctx.manifest.totalChunks}.`);
          }
          totalAssembledBytes += chunk.byteLength;
          computedChain = await advanceHashChain(computedChain, chunk);
          orderedBuffers.push(chunk);
        }

        if (totalAssembledBytes !== ctx.manifest.size) {
          throw new Error('Reassembled file byte count does not match manifest.');
        }

        if (computedChain !== msg.finalize.chainRootHex) {
          throw new Error('SHA-256 integrity hash chain mismatch — transfer rejected.');
        }

        const canonical = buildCanonicalSignPayload({
          transferId: ctx.transferId,
          fileName: ctx.manifest.name,
          fileSize: ctx.manifest.size,
          totalChunks: ctx.manifest.totalChunks,
          chainRootHex: computedChain,
        });
        const verifyKey = ctx.expectedSenderSigningPublicKey || ctx.manifest.senderSigningPublicKey;
        const sigValid = await verifyTransferRoot(
          canonical,
          msg.finalize.signature,
          verifyKey
        );

        if (!sigValid) {
          throw new Error('Sender ECDSA P-256 digital signature verification failed.');
        }

        const safeFileName = sanitizeDownloadFilename(ctx.manifest.name);
        const blob = new Blob(orderedBuffers, { type: ctx.manifest.mimeType });
        triggerBrowserDownload(blob, safeFileName);

        const durationSec = Math.max(0.05, (Date.now() - ctx.startTime) / 1000);
        const result: DownloadCompletedInfo = {
          transferId: ctx.transferId,
          fileName: safeFileName,
          size: ctx.manifest.size,
          transport: ctx.transport,
          verified: true,
          durationSec,
          avgSpeedBytesPerSec: ctx.manifest.size / durationSec,
        };

        ctx.pc?.close();
        this.activeDownloads.delete(ctx.transferId);
        ctx.resolve(result);
      }
    } catch (err) {
      this.failDownload(ctx, err instanceof Error ? err.message : 'Decryption or verification failed');
    }
  }

  private failDownload(ctx: ActiveDownloadContext, message: string) {
    if (ctx.cancelled) return;
    ctx.cancelled = true;
    ctx.pc?.close();
    this.activeDownloads.delete(ctx.transferId);
    ctx.reject(new Error(message));
  }
}
