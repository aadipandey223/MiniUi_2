import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import type { SharedFileMeta } from './shared/types.ts';
import { isSameOriginRequest, isValidRoomId } from './shared/security.ts';
import {
  CHALLENGE_TTL_MS,
  MAX_DISPLAY_NAME_LEN,
  MAX_FILES_PER_PEER,
  MAX_FILE_NAME_LEN,
  MAX_FILE_SIZE_BYTES,
  MAX_PEERS_PER_ROOM,
  createVaultApiApp,
  getClientIp,
  sanitizeText,
  verifyHmacProof,
  type ServerPeer,
  type ServerRoom,
} from './shared/vaultApi.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const { app, store } = createVaultApiApp({ mode: 'socketio' });
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;
      if (isSameOriginRequest(origin, host)) {
        callback(null, true);
      } else {
        callback('Origin not permitted', false);
      }
    },
    maxHttpBufferSize: 2 * 1024 * 1024, // 2MB per encrypted relay packet
  });

  function broadcastLobbyState() {
    const lobby = store.getLobbyState();
    for (const peer of store.peers.values()) {
      if (peer.roomId === null && peer.transport === 'socketio') {
        io.to(peer.id).emit('lobby:state', lobby);
      }
    }
  }

  function broadcastRoomState(roomId: string) {
    const state = store.getRoomState(roomId);
    if (!state) return;
    io.to(roomId).emit('room:state', state);
  }

  // Bind Socket.IO transport hooks into the unified store so Socket.IO and HTTP signaling interoperate seamlessly
  store.bindSocketHooks({
    emitToPeer: (peerId, event, payload) => {
      io.to(peerId).emit(event, payload);
    },
    broadcastScope: (roomId) => {
      if (roomId) {
        broadcastRoomState(roomId);
      } else {
        broadcastLobbyState();
      }
    },
  });

  function removeSocketPeerFromRoom(socketId: string) {
    const peer = store.peers.get(socketId);
    if (!peer || !peer.roomId) return;
    const roomId = peer.roomId;
    io.sockets.sockets.get(socketId)?.leave(roomId);
    store.removePeerFromCurrentRoom(socketId);

    const room = store.rooms.get(roomId);
    if (room && room.peers.size === 0) {
      setTimeout(() => {
        const current = store.rooms.get(roomId);
        if (current && current.peers.size === 0 && Date.now() - current.createdAt > 60_000) {
          store.rooms.delete(roomId);
          void store.kv.deleteRoom(roomId);
        }
      }, 60_000);
    }
  }

  function completeRoomJoin(socketId: string, room: ServerRoom) {
    const peer = store.peers.get(socketId);
    const sock = io.sockets.sockets.get(socketId);
    if (!peer || !sock) return;

    if (peer.roomId && peer.roomId !== room.id) {
      removeSocketPeerFromRoom(socketId);
    }

    peer.roomId = room.id;
    room.peers.add(socketId);
    sock.join(room.id);

    const state = store.getRoomState(room.id);
    if (state) {
      sock.emit('room:joined', state);
    }
    broadcastRoomState(room.id);
    broadcastLobbyState();
  }

  // Socket.IO signaling & room state synchronization
  io.on('connection', (socket) => {
    const clientIp = getClientIp({
      headers: socket.handshake.headers as Record<string, string | string[] | undefined>,
      socket: { remoteAddress: socket.handshake.address },
    });

    const defaultPeer: ServerPeer = {
      id: socket.id,
      displayName: `Peer-${socket.id.slice(0, 4).toUpperCase()}`,
      fingerprint: '',
      signingPublicKey: '',
      ecdhPublicKey: '',
      joinedAt: Date.now(),
      roomId: null,
      clientIp,
      transport: 'socketio',
      peerToken: null,
      lastSeenAt: Date.now(),
      lobbyFileIds: new Set(),
      roomFileIds: new Set(),
      inbox: [],
    };
    store.peers.set(socket.id, defaultPeer);

    socket.on('peer:register', (payload: {
      displayName?: unknown;
      fingerprint?: unknown;
      signingPublicKey?: unknown;
      ecdhPublicKey?: unknown;
    }) => {
      const peer = store.peers.get(socket.id);
      if (!peer) return;
      if (!store.registerLimiter.consume(socket.id).allowed) return;

      peer.displayName = sanitizeText(payload?.displayName, MAX_DISPLAY_NAME_LEN, peer.displayName);
      if (typeof payload?.fingerprint === 'string' && /^[0-9a-fA-F]{6,16}$/.test(payload.fingerprint)) {
        peer.fingerprint = payload.fingerprint.toUpperCase();
      }
      if (typeof payload?.signingPublicKey === 'string' && payload.signingPublicKey.length < 2048) {
        peer.signingPublicKey = payload.signingPublicKey;
      }
      if (typeof payload?.ecdhPublicKey === 'string' && payload.ecdhPublicKey.length < 2048) {
        peer.ecdhPublicKey = payload.ecdhPublicKey;
      }
      peer.lastSeenAt = Date.now();

      store.notifyScopeChanged(peer.roomId);
    });

    socket.on('room:join-request', async (payload: { roomId?: unknown }) => {
      const peer = store.peers.get(socket.id);
      if (!peer) return;

      const rate = store.joinRequestLimiter.consume(`${peer.clientIp}:${socket.id}`);
      if (!rate.allowed) {
        return socket.emit('room:error', {
          error: `Too many join attempts. Please wait ${rate.retryAfterSec}s.`,
        });
      }

      const rawId = typeof payload?.roomId === 'string' ? payload.roomId.toUpperCase().trim() : '';
      if (!isValidRoomId(rawId)) {
        return socket.emit('room:error', { error: 'Invalid room code format.' });
      }

      const lockKey = `${peer.clientIp}:${rawId}`;
      const lockStatus = store.authLockout.check(lockKey);
      if (lockStatus.locked) {
        const mins = Math.max(1, Math.ceil(lockStatus.retryAfterSec / 60));
        return socket.emit('room:error', {
          error: `Too many failed password attempts. Locked for ${mins} minute${mins === 1 ? '' : 's'}.`,
        });
      }

      const room = await store.getOrHydrateRoom(rawId);
      if (!room) {
        return socket.emit('room:error', { error: 'Room not found or expired.' });
      }
      if (room.expiresAt && Date.now() > room.expiresAt) {
        store.rooms.delete(rawId);
        await store.kv.deleteRoom(rawId);
        return socket.emit('room:error', { error: 'This room has expired.' });
      }
      if (!room.peers.has(socket.id) && room.peers.size >= MAX_PEERS_PER_ROOM) {
        return socket.emit('room:error', { error: 'This private room is full.' });
      }

      if (room.passwordVerifier) {
        const nonce = crypto.randomBytes(32).toString('hex');
        store.authChallenges.set(socket.id, {
          roomId: rawId,
          nonce,
          expiresAt: Date.now() + CHALLENGE_TTL_MS,
        });
        return socket.emit('room:challenge', {
          roomId: rawId,
          roomName: room.name,
          nonce,
        });
      }

      completeRoomJoin(socket.id, room);
    });

    socket.on('room:auth-proof', async (payload: { roomId?: unknown; proof?: unknown }) => {
      const peer = store.peers.get(socket.id);
      if (!peer) return;

      const challenge = store.authChallenges.get(socket.id);
      if (!challenge || Date.now() > challenge.expiresAt) {
        store.authChallenges.delete(socket.id);
        return socket.emit('room:error', { error: 'Authentication challenge expired. Please try again.' });
      }

      const roomId = typeof payload?.roomId === 'string' ? payload.roomId.toUpperCase() : '';
      if (roomId !== challenge.roomId) {
        store.authChallenges.delete(socket.id);
        return socket.emit('room:error', { error: 'Room mismatch during authentication.' });
      }

      const lockKey = `${peer.clientIp}:${roomId}`;
      const lockStatus = store.authLockout.check(lockKey);
      if (lockStatus.locked) {
        store.authChallenges.delete(socket.id);
        const mins = Math.max(1, Math.ceil(lockStatus.retryAfterSec / 60));
        return socket.emit('room:error', {
          error: `Too many failed password attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
        });
      }

      const room = await store.getOrHydrateRoom(roomId);
      if (!room || !room.passwordVerifier) {
        store.authChallenges.delete(socket.id);
        return socket.emit('room:error', { error: 'Room no longer exists.' });
      }

      const proof = typeof payload?.proof === 'string' ? payload.proof.toLowerCase() : '';
      const valid = verifyHmacProof(proof, room.passwordVerifier, challenge.nonce);
      store.authChallenges.delete(socket.id);

      if (!valid) {
        const failure = store.authLockout.recordFailure(lockKey);
        if (failure.locked) {
          return socket.emit('room:error', {
            error: 'Incorrect password. Room access temporarily locked after repeated failures.',
          });
        }
        return socket.emit('room:error', {
          error: `Incorrect room password (${failure.attemptsRemaining} attempt${failure.attemptsRemaining === 1 ? '' : 's'} left).`,
        });
      }

      store.authLockout.recordSuccess(lockKey);
      completeRoomJoin(socket.id, room);
    });

    socket.on('room:leave', () => {
      const peer = store.peers.get(socket.id);
      if (!peer) return;
      removeSocketPeerFromRoom(socket.id);
      socket.emit('room:left');
      broadcastLobbyState();
    });

    socket.on('file:share', (payload: {
      clientTempId?: unknown;
      name?: unknown;
      size?: unknown;
      mimeType?: unknown;
      expiresInMs?: unknown;
    }) => {
      const peer = store.peers.get(socket.id);
      if (!peer) return;

      if (!store.fileShareLimiter.consume(socket.id).allowed) {
        return socket.emit('file:error', { error: 'Sharing too quickly. Please wait a moment.' });
      }

      const currentOwned = peer.roomId ? peer.roomFileIds.size : peer.lobbyFileIds.size;
      if (currentOwned >= MAX_FILES_PER_PEER) {
        return socket.emit('file:error', {
          error: `Maximum ${MAX_FILES_PER_PEER} shared files per session reached.`,
        });
      }

      const name = sanitizeText(payload?.name, MAX_FILE_NAME_LEN, 'untitled-file');
      const size = typeof payload?.size === 'number' && Number.isFinite(payload.size) ? Math.floor(payload.size) : -1;
      if (size < 0 || size > MAX_FILE_SIZE_BYTES) {
        return socket.emit('file:error', { error: 'File size must be between 0 B and 2 GB.' });
      }

      const mimeType = sanitizeText(payload?.mimeType, 128, 'application/octet-stream');
      let expiresAt: number | null = null;
      if (typeof payload?.expiresInMs === 'number' && Number.isFinite(payload.expiresInMs) && payload.expiresInMs > 0) {
        expiresAt = Date.now() + Math.min(payload.expiresInMs, 24 * 60 * 60 * 1000);
      }

      const fileId = `${socket.id.slice(0, 6)}-${crypto.randomBytes(6).toString('hex')}`;
      const meta: SharedFileMeta = {
        id: fileId,
        name,
        size,
        mimeType,
        peerId: socket.id,
        peerName: peer.displayName,
        peerFingerprint: peer.fingerprint,
        roomId: peer.roomId,
        sharedAt: Date.now(),
        expiresAt,
      };

      if (peer.roomId) {
        const room = store.rooms.get(peer.roomId);
        if (!room) return;
        room.files.set(fileId, meta);
        peer.roomFileIds.add(fileId);
        socket.emit('file:confirmed', {
          clientTempId: typeof payload?.clientTempId === 'string' ? payload.clientTempId : null,
          file: meta,
        });
        broadcastRoomState(peer.roomId);
      } else {
        store.lobbyFiles.set(fileId, meta);
        peer.lobbyFileIds.add(fileId);
        socket.emit('file:confirmed', {
          clientTempId: typeof payload?.clientTempId === 'string' ? payload.clientTempId : null,
          file: meta,
        });
        broadcastLobbyState();
      }
    });

    socket.on('file:unshare', (payload: { fileId?: unknown }) => {
      const peer = store.peers.get(socket.id);
      const fileId = typeof payload?.fileId === 'string' ? payload.fileId : '';
      if (!peer || !fileId) return;

      if (peer.roomId && peer.roomFileIds.has(fileId)) {
        store.rooms.get(peer.roomId)?.files.delete(fileId);
        peer.roomFileIds.delete(fileId);
        broadcastRoomState(peer.roomId);
      } else if (peer.lobbyFileIds.has(fileId)) {
        store.lobbyFiles.delete(fileId);
        peer.lobbyFileIds.delete(fileId);
        broadcastLobbyState();
      }
    });

    socket.on('file:unshare-all', () => {
      const peer = store.peers.get(socket.id);
      if (!peer) return;

      if (peer.roomId) {
        const room = store.rooms.get(peer.roomId);
        for (const fileId of peer.roomFileIds) {
          room?.files.delete(fileId);
        }
        peer.roomFileIds.clear();
        broadcastRoomState(peer.roomId);
      } else {
        for (const fileId of peer.lobbyFileIds) {
          store.lobbyFiles.delete(fileId);
        }
        peer.lobbyFileIds.clear();
        broadcastLobbyState();
      }
    });

    // WebRTC & E2E-Encrypted Relay signaling (routed via store so Socket.IO & HTTP peers interoperate)
    socket.on('webrtc:offer', (payload: { targetPeerId?: unknown; transferId?: unknown; offer?: RTCSessionDescriptionInit }) => {
      if (
        typeof payload?.targetPeerId !== 'string' ||
        typeof payload?.transferId !== 'string' ||
        !payload.offer ||
        !store.canPeersCommunicate(socket.id, payload.targetPeerId)
      ) {
        return;
      }
      store.enqueueToPeer(payload.targetPeerId, 'webrtc:offer', {
        fromPeerId: socket.id,
        transferId: payload.transferId,
        offer: payload.offer,
      });
    });

    socket.on('webrtc:answer', (payload: { targetPeerId?: unknown; transferId?: unknown; answer?: RTCSessionDescriptionInit }) => {
      if (
        typeof payload?.targetPeerId !== 'string' ||
        typeof payload?.transferId !== 'string' ||
        !payload.answer ||
        !store.canPeersCommunicate(socket.id, payload.targetPeerId)
      ) {
        return;
      }
      store.enqueueToPeer(payload.targetPeerId, 'webrtc:answer', {
        fromPeerId: socket.id,
        transferId: payload.transferId,
        answer: payload.answer,
      });
    });

    socket.on('webrtc:ice', (payload: { targetPeerId?: unknown; transferId?: unknown; candidate?: RTCIceCandidateInit }) => {
      if (
        typeof payload?.targetPeerId !== 'string' ||
        typeof payload?.transferId !== 'string' ||
        !payload.candidate ||
        !store.canPeersCommunicate(socket.id, payload.targetPeerId)
      ) {
        return;
      }
      store.enqueueToPeer(payload.targetPeerId, 'webrtc:ice', {
        fromPeerId: socket.id,
        transferId: payload.transferId,
        candidate: payload.candidate,
      });
    });

    socket.on('relay:request', (payload: { targetPeerId?: unknown; transferId?: unknown; fileId?: unknown; receiverEcdhPublicKey?: unknown }) => {
      if (
        typeof payload?.targetPeerId !== 'string' ||
        typeof payload?.transferId !== 'string' ||
        typeof payload?.fileId !== 'string' ||
        typeof payload?.receiverEcdhPublicKey !== 'string' ||
        !store.canPeersCommunicate(socket.id, payload.targetPeerId)
      ) {
        return;
      }
      store.enqueueToPeer(payload.targetPeerId, 'relay:request', {
        fromPeerId: socket.id,
        transferId: payload.transferId,
        fileId: payload.fileId,
        receiverEcdhPublicKey: payload.receiverEcdhPublicKey,
      });
    });

    socket.on('relay:packet', (payload: { targetPeerId?: unknown; transferId?: unknown; packet?: unknown }) => {
      if (
        typeof payload?.targetPeerId !== 'string' ||
        typeof payload?.transferId !== 'string' ||
        !store.canPeersCommunicate(socket.id, payload.targetPeerId)
      ) {
        return;
      }
      store.enqueueToPeer(payload.targetPeerId, 'relay:packet', {
        fromPeerId: socket.id,
        transferId: payload.transferId,
        packet: payload.packet,
      });
    });

    socket.on('relay:cancel', (payload: { targetPeerId?: unknown; transferId?: unknown }) => {
      if (
        typeof payload?.targetPeerId !== 'string' ||
        typeof payload?.transferId !== 'string' ||
        !store.canPeersCommunicate(socket.id, payload.targetPeerId)
      ) {
        return;
      }
      store.enqueueToPeer(payload.targetPeerId, 'relay:cancel', {
        fromPeerId: socket.id,
        transferId: payload.transferId,
      });
    });

    socket.on('disconnect', () => {
      const peer = store.peers.get(socket.id);
      if (peer?.roomId) {
        io.sockets.sockets.get(socket.id)?.leave(peer.roomId);
      }
      store.disconnectPeer(socket.id);
    });

    // Initial lobby state sync
    socket.emit('lobby:state', store.getLobbyState());
  });

  // Periodic maintenance for expired files, expired rooms, stale HTTP peers & rate limiters
  setInterval(() => {
    for (const [roomId, room] of store.rooms.entries()) {
      if (room.expiresAt && Date.now() >= room.expiresAt) {
        for (const peerId of room.peers) {
          io.sockets.sockets.get(peerId)?.leave(roomId);
        }
      }
    }
    store.runMaintenance();
  }, 5_000);

  // Frontend serving: Vite middleware in development, built dist/ in production
  const distDir = path.resolve(__dirname, 'dist');
  const distIndex = path.join(distDir, 'index.html');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distIndex)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(distIndex);
    });
  } else {
    app.get('*', (_req, res) => {
      res.status(503).send('VaultBeam client bundle not built. Run npm run build first.');
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`VaultBeam server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start VaultBeam server:', err);
  process.exit(1);
});
