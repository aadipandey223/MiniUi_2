import crypto from 'node:crypto';
import express, { type Express } from 'express';
import cors from 'cors';
import type { PeerInfo, RoomSummary, SharedFileMeta } from './types.ts';
import {
  AuthLockoutTracker,
  SlidingWindowRateLimiter,
  isSameOriginRequest,
  isValidRoomId,
  sanitizeHostHeader,
} from './security.ts';

export const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_ID_LENGTH = 9;
export const MAX_ROOM_NAME_LEN = 48;
export const MAX_DISPLAY_NAME_LEN = 32;
export const MAX_FILE_NAME_LEN = 255;
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const MAX_ROOMS = 500;
export const MAX_PEERS_PER_ROOM = 32;
export const MAX_FILES_PER_PEER = 50;
export const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const HTTP_PEER_STALE_MS = 30_000;
const MAX_QUEUED_EVENTS_PER_PEER = 250;

export interface ServerPeer extends PeerInfo {
  roomId: string | null;
  clientIp: string;
  transport: 'socketio' | 'http';
  peerToken: string | null;
  lastSeenAt: number;
  lobbyFileIds: Set<string>;
  roomFileIds: Set<string>;
  inbox: QueuedSignalEvent[];
}

export interface ServerRoom {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number | null;
  passwordVerifier: string | null;
  peers: Set<string>;
  files: Map<string, SharedFileMeta>;
}

export interface AuthChallenge {
  roomId: string;
  nonce: string;
  expiresAt: number;
}

export interface QueuedSignalEvent {
  event: string;
  payload: unknown;
}

interface SerializedRoomRecord {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number | null;
  passwordVerifier: string | null;
}

/**
 * Optional zero-dependency Upstash / Vercel KV REST bridge.
 * Automatically activates on Vercel if KV_REST_API_URL or UPSTASH_REDIS_REST_URL is configured,
 * synchronizing room definitions & signaling mailboxes across serverless instances.
 */
class OptionalKvBridge {
  private readonly url: string | null;
  private readonly token: string | null;

  constructor() {
    const rawUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
    const rawToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
    this.url = rawUrl ? rawUrl.replace(/\/+$/, '') : null;
    this.token = rawToken || null;
  }

  public get enabled(): boolean {
    return Boolean(this.url && this.token);
  }

  private async cmd<T = unknown>(command: (string | number)[]): Promise<T | null> {
    if (!this.url || !this.token) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { result?: T };
      return data.result ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  public async saveRoom(room: ServerRoom): Promise<void> {
    if (!this.enabled) return;
    const record: SerializedRoomRecord = {
      id: room.id,
      name: room.name,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      passwordVerifier: room.passwordVerifier,
    };
    const ttlSec = room.expiresAt
      ? Math.max(60, Math.ceil((room.expiresAt - Date.now()) / 1000))
      : 24 * 60 * 60;
    await this.cmd(['SET', `vb:room:${room.id}`, JSON.stringify(record), 'EX', ttlSec]);
  }

  public async loadRoom(roomId: string): Promise<SerializedRoomRecord | null> {
    if (!this.enabled) return null;
    const raw = await this.cmd<string>(['GET', `vb:room:${roomId}`]);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SerializedRoomRecord;
    } catch {
      return null;
    }
  }

  public async deleteRoom(roomId: string): Promise<void> {
    if (!this.enabled) return;
    await this.cmd(['DEL', `vb:room:${roomId}`]);
  }

  public async pushInbox(targetPeerId: string, item: QueuedSignalEvent): Promise<void> {
    if (!this.enabled) return;
    const key = `vb:inbox:${targetPeerId}`;
    await this.cmd(['RPUSH', key, JSON.stringify(item)]);
    await this.cmd(['EXPIRE', key, 120]);
  }

  public async drainInbox(peerId: string): Promise<QueuedSignalEvent[]> {
    if (!this.enabled) return [];
    const key = `vb:inbox:${peerId}`;
    const items = await this.cmd<string[]>(['LRANGE', key, 0, 99]);
    if (!Array.isArray(items) || items.length === 0) return [];
    await this.cmd(['LTRIM', key, items.length, -1]);
    const parsed: QueuedSignalEvent[] = [];
    for (const entry of items) {
      try {
        parsed.push(JSON.parse(entry) as QueuedSignalEvent);
      } catch {
        // Ignore malformed entry
      }
    }
    return parsed;
  }
}

export function getClientIp(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  if (raw) {
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function sanitizeText(input: unknown, maxLen: number, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const cleaned = input.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLen);
}

export function isValidHex(value: unknown, expectedLen: number): value is string {
  return typeof value === 'string' && value.length === expectedLen && /^[0-9a-f]+$/i.test(value);
}

export function verifyHmacProof(proofHex: string, verifierHex: string, nonce: string): boolean {
  if (!isValidHex(proofHex, 64)) return false;
  const expected = crypto
    .createHmac('sha256', Buffer.from(verifierHex, 'hex'))
    .update(nonce)
    .digest();
  const actual = Buffer.from(proofHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function verifyPeerToken(provided: unknown, expected: string | null): boolean {
  if (typeof provided !== 'string' || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export class VaultStateStore {
  public readonly peers = new Map<string, ServerPeer>();
  public readonly lobbyFiles = new Map<string, SharedFileMeta>();
  public readonly rooms = new Map<string, ServerRoom>();
  public readonly authChallenges = new Map<string, AuthChallenge>();
  public readonly kv = new OptionalKvBridge();

  public readonly reserveIdLimiter = new SlidingWindowRateLimiter(30, 10 * 60 * 1000);
  public readonly createRoomLimiter = new SlidingWindowRateLimiter(20, 10 * 60 * 1000);
  public readonly lookupRoomLimiter = new SlidingWindowRateLimiter(45, 60 * 1000);
  public readonly joinRequestLimiter = new SlidingWindowRateLimiter(24, 60 * 1000);
  public readonly fileShareLimiter = new SlidingWindowRateLimiter(60, 60 * 1000);
  public readonly registerLimiter = new SlidingWindowRateLimiter(25, 60 * 1000);
  public readonly authLockout = new AuthLockoutTracker(5, 15 * 60 * 1000, 15 * 60 * 1000);

  private socketRelayEmitter: ((peerId: string, event: string, payload: unknown) => void) | null = null;
  private socketStateBroadcaster: ((roomId: string | null) => void) | null = null;

  public bindSocketHooks(hooks: {
    emitToPeer: (peerId: string, event: string, payload: unknown) => void;
    broadcastScope: (roomId: string | null) => void;
  }) {
    this.socketRelayEmitter = hooks.emitToPeer;
    this.socketStateBroadcaster = hooks.broadcastScope;
  }

  public generateRoomId(): string {
    const bytes = crypto.randomBytes(ROOM_ID_LENGTH);
    let id = '';
    for (let i = 0; i < ROOM_ID_LENGTH; i++) {
      id += ROOM_ID_CHARS[bytes[i] % ROOM_ID_CHARS.length];
    }
    return this.rooms.has(id) ? this.generateRoomId() : id;
  }

  public toPeerInfo(peer: ServerPeer): PeerInfo {
    return {
      id: peer.id,
      displayName: peer.displayName,
      fingerprint: peer.fingerprint,
      signingPublicKey: peer.signingPublicKey,
      ecdhPublicKey: peer.ecdhPublicKey,
      joinedAt: peer.joinedAt,
    };
  }

  public toRoomSummary(room: ServerRoom): RoomSummary {
    return {
      id: room.id,
      name: room.name,
      requiresPassword: Boolean(room.passwordVerifier),
      peerCount: room.peers.size,
      fileCount: room.files.size,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
    };
  }

  public getLobbyState(): { peers: PeerInfo[]; files: SharedFileMeta[] } {
    const list: PeerInfo[] = [];
    for (const peer of this.peers.values()) {
      if (peer.roomId === null) {
        list.push(this.toPeerInfo(peer));
      }
    }
    return {
      peers: list,
      files: Array.from(this.lobbyFiles.values()),
    };
  }

  public getRoomState(roomId: string): { room: RoomSummary; peers: PeerInfo[]; files: SharedFileMeta[] } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const roomPeers: PeerInfo[] = [];
    for (const pid of room.peers) {
      const p = this.peers.get(pid);
      if (p) roomPeers.push(this.toPeerInfo(p));
    }
    return {
      room: this.toRoomSummary(room),
      peers: roomPeers,
      files: Array.from(room.files.values()),
    };
  }

  public async getOrHydrateRoom(roomId: string): Promise<ServerRoom | null> {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;
    const remote = await this.kv.loadRoom(roomId);
    if (!remote) return null;
    if (remote.expiresAt && Date.now() > remote.expiresAt) {
      await this.kv.deleteRoom(roomId);
      return null;
    }
    const hydrated: ServerRoom = {
      id: remote.id,
      name: remote.name,
      createdAt: remote.createdAt,
      expiresAt: remote.expiresAt,
      passwordVerifier: remote.passwordVerifier,
      peers: new Set(),
      files: new Map(),
    };
    this.rooms.set(roomId, hydrated);
    return hydrated;
  }

  public canPeersCommunicate(senderId: string, targetId: string): boolean {
    const sender = this.peers.get(senderId);
    const target = this.peers.get(targetId);
    if (!sender || !target || senderId === targetId) return false;
    return sender.roomId === target.roomId;
  }

  public enqueueToPeer(targetPeerId: string, event: string, payload: unknown): void {
    const target = this.peers.get(targetPeerId);
    if (!target) {
      if (this.kv.enabled) {
        void this.kv.pushInbox(targetPeerId, { event, payload });
      }
      return;
    }
    if (target.transport === 'socketio' && this.socketRelayEmitter) {
      this.socketRelayEmitter(targetPeerId, event, payload);
      return;
    }
    if (target.inbox.length >= MAX_QUEUED_EVENTS_PER_PEER) {
      target.inbox.shift();
    }
    target.inbox.push({ event, payload });
  }

  public notifyScopeChanged(roomId: string | null): void {
    if (this.socketStateBroadcaster) {
      this.socketStateBroadcaster(roomId);
    }
  }

  public removePeerFromCurrentRoom(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.roomId) return;
    const roomId = peer.roomId;
    const room = this.rooms.get(roomId);

    if (room) {
      room.peers.delete(peerId);
      for (const fileId of peer.roomFileIds) {
        room.files.delete(fileId);
      }
      peer.roomFileIds.clear();

      if (room.peers.size > 0) {
        this.notifyScopeChanged(roomId);
      }
    }
    peer.roomId = null;
  }

  public disconnectPeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (peer.roomId) {
      this.removePeerFromCurrentRoom(peerId);
    }
    for (const fileId of peer.lobbyFileIds) {
      this.lobbyFiles.delete(fileId);
    }
    this.peers.delete(peerId);
    this.authChallenges.delete(peerId);
    this.notifyScopeChanged(null);
  }

  public runMaintenance(now = Date.now()): void {
    // Evict stale HTTP peers whose heartbeat timed out
    for (const [peerId, peer] of this.peers.entries()) {
      if (peer.transport === 'http' && now - peer.lastSeenAt > HTTP_PEER_STALE_MS) {
        this.disconnectPeer(peerId);
      }
    }

    let lobbyChanged = false;
    for (const [fileId, file] of this.lobbyFiles.entries()) {
      if (file.expiresAt && now >= file.expiresAt) {
        this.lobbyFiles.delete(fileId);
        this.peers.get(file.peerId)?.lobbyFileIds.delete(fileId);
        lobbyChanged = true;
      }
    }
    if (lobbyChanged) this.notifyScopeChanged(null);

    for (const [roomId, room] of this.rooms.entries()) {
      if (room.expiresAt && now >= room.expiresAt) {
        for (const peerId of room.peers) {
          this.enqueueToPeer(peerId, 'room:expired', { roomId });
          const p = this.peers.get(peerId);
          if (p) {
            p.roomId = null;
            p.roomFileIds.clear();
          }
        }
        this.rooms.delete(roomId);
        void this.kv.deleteRoom(roomId);
        this.notifyScopeChanged(null);
        continue;
      }

      let roomChanged = false;
      for (const [fileId, file] of room.files.entries()) {
        if (file.expiresAt && now >= file.expiresAt) {
          room.files.delete(fileId);
          this.peers.get(file.peerId)?.roomFileIds.delete(fileId);
          roomChanged = true;
        }
      }
      if (roomChanged) this.notifyScopeChanged(roomId);
    }

    for (const [id, challenge] of this.authChallenges.entries()) {
      if (now > challenge.expiresAt) {
        this.authChallenges.delete(id);
      }
    }

    this.reserveIdLimiter.prune(now);
    this.createRoomLimiter.prune(now);
    this.lookupRoomLimiter.prune(now);
    this.joinRequestLimiter.prune(now);
    this.fileShareLimiter.prune(now);
    this.registerLimiter.prune(now);
    this.authLockout.prune(now);
  }
}

export function createVaultApiApp(options: {
  mode: 'socketio' | 'serverless';
  store?: VaultStateStore;
}): { app: Express; store: VaultStateStore } {
  const store = options.store ?? new VaultStateStore();
  const app = express();
  app.disable('x-powered-by');

  // Security headers (iframe-compatible)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });

  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;
      const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;
      callback(null, {
        origin: isSameOriginRequest(origin, host),
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'X-Peer-Id', 'X-Peer-Token'],
      });
    })
  );

  app.use(express.json({ limit: '2mb' }));

  // Health & transport capability probe
  app.get('/api/health', (_req, res) => {
    store.runMaintenance();
    res.json({
      ok: true,
      mode: options.mode,
      persistence: store.kv.enabled ? 'redis' : 'memory',
      peers: store.peers.size,
      rooms: store.rooms.size,
    });
  });

  // Reserve collision-free room code before deriving password verifier on client
  app.get('/api/rooms/reserve-id', (req, res) => {
    store.runMaintenance();
    const ip = getClientIp(req);
    const limit = store.reserveIdLimiter.consume(ip);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      return res.status(429).json({
        success: false,
        error: `Too many room requests. Try again in ${limit.retryAfterSec}s.`,
      });
    }
    return res.json({ success: true, roomId: store.generateRoomId() });
  });

  // Create a private encrypted room
  app.post('/api/rooms', async (req, res) => {
    store.runMaintenance();
    const ip = getClientIp(req);
    const limit = store.createRoomLimiter.consume(ip);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      return res.status(429).json({
        success: false,
        error: `Room creation rate limit reached. Try again in ${limit.retryAfterSec}s.`,
      });
    }

    if (store.rooms.size >= MAX_ROOMS) {
      return res.status(429).json({ success: false, error: 'Maximum active rooms reached. Try again shortly.' });
    }

    const body = (req.body ?? {}) as {
      roomId?: unknown;
      name?: unknown;
      passwordVerifier?: unknown;
      expiresInMs?: unknown;
    };

    const requestedId = typeof body.roomId === 'string' ? body.roomId.toUpperCase() : '';
    const roomId = isValidRoomId(requestedId) && !store.rooms.has(requestedId) ? requestedId : store.generateRoomId();
    const roomName = sanitizeText(body.name, MAX_ROOM_NAME_LEN, `Room ${roomId.slice(0, 4)}`);

    let passwordVerifier: string | null = null;
    if (body.passwordVerifier !== null && body.passwordVerifier !== undefined && body.passwordVerifier !== '') {
      if (!isValidHex(body.passwordVerifier, 64)) {
        return res.status(400).json({ success: false, error: 'Invalid password verifier format.' });
      }
      passwordVerifier = body.passwordVerifier.toLowerCase();
    }

    let expiresAt: number | null = null;
    if (typeof body.expiresInMs === 'number' && Number.isFinite(body.expiresInMs) && body.expiresInMs > 0) {
      const clampedMs = Math.min(body.expiresInMs, 7 * 24 * 60 * 60 * 1000);
      expiresAt = Date.now() + clampedMs;
    }

    const room: ServerRoom = {
      id: roomId,
      name: roomName,
      createdAt: Date.now(),
      expiresAt,
      passwordVerifier,
      peers: new Set(),
      files: new Map(),
    };

    store.rooms.set(roomId, room);
    await store.kv.saveRoom(room);

    const rawProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim().toLowerCase();
    const proto = rawProto === 'https' || rawProto === 'http' ? rawProto : req.protocol;
    const safeHost = sanitizeHostHeader(
      (req.headers['x-forwarded-host'] as string | undefined) || req.get('host'),
      'localhost:3000'
    );

    return res.status(201).json({
      success: true,
      room: store.toRoomSummary(room),
      shareLink: `${proto}://${safeHost}/room/${roomId}`,
    });
  });

  // Lookup public room metadata
  app.get('/api/rooms/:roomId', async (req, res) => {
    store.runMaintenance();
    const ip = getClientIp(req);
    const limit = store.lookupRoomLimiter.consume(ip);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      return res.status(429).json({
        success: false,
        error: `Too many room lookups. Try again in ${limit.retryAfterSec}s.`,
      });
    }

    const rawId = req.params.roomId.toUpperCase();
    if (!isValidRoomId(rawId)) {
      return res.status(400).json({ success: false, error: 'Invalid room code format.' });
    }

    const room = await store.getOrHydrateRoom(rawId);
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found or has already closed.' });
    }

    if (room.expiresAt && Date.now() > room.expiresAt) {
      store.rooms.delete(rawId);
      await store.kv.deleteRoom(rawId);
      return res.status(410).json({ success: false, error: 'This room has expired.' });
    }

    return res.json({
      success: true,
      room: store.toRoomSummary(room),
    });
  });

  // =========================================================================
  // Serverless HTTP Signaling Endpoints (powers Vercel without WebSockets)
  // =========================================================================

  app.post('/api/signal/connect', (req, res) => {
    store.runMaintenance();
    const clientIp = getClientIp(req);
    const peerId = `vb-${crypto.randomBytes(9).toString('hex')}`;
    const peerToken = crypto.randomBytes(32).toString('hex');

    const peer: ServerPeer = {
      id: peerId,
      displayName: `Peer-${peerId.slice(3, 7).toUpperCase()}`,
      fingerprint: '',
      signingPublicKey: '',
      ecdhPublicKey: '',
      joinedAt: Date.now(),
      roomId: null,
      clientIp,
      transport: 'http',
      peerToken,
      lastSeenAt: Date.now(),
      lobbyFileIds: new Set(),
      roomFileIds: new Set(),
      inbox: [],
    };
    store.peers.set(peerId, peer);
    store.notifyScopeChanged(null);

    return res.status(201).json({
      success: true,
      peerId,
      peerToken,
      lobby: store.getLobbyState(),
    });
  });

  function authenticateHttpPeer(req: express.Request): ServerPeer | null {
    const peerId = (req.headers['x-peer-id'] as string | undefined) || (req.body as { peerId?: string })?.peerId;
    const peerToken =
      (req.headers['x-peer-token'] as string | undefined) || (req.body as { peerToken?: string })?.peerToken;
    if (typeof peerId !== 'string' || !peerId) return null;
    const peer = store.peers.get(peerId);
    if (!peer || peer.transport !== 'http') return null;
    if (!verifyPeerToken(peerToken, peer.peerToken)) return null;
    peer.lastSeenAt = Date.now();
    return peer;
  }

  app.get('/api/signal/poll', async (req, res) => {
    store.runMaintenance();
    const peer = authenticateHttpPeer(req);
    if (!peer) {
      return res.status(401).json({ success: false, reconnect: true, error: 'Session expired. Reconnecting.' });
    }

    const events: QueuedSignalEvent[] = peer.inbox.splice(0, peer.inbox.length);
    if (store.kv.enabled) {
      const remoteEvents = await store.kv.drainInbox(peer.id);
      events.push(...remoteEvents);
    }

    const stateEvent: QueuedSignalEvent = peer.roomId
      ? {
          event: 'room:state',
          payload: store.getRoomState(peer.roomId),
        }
      : {
          event: 'lobby:state',
          payload: store.getLobbyState(),
        };

    if (stateEvent.payload) {
      events.push(stateEvent);
    }

    return res.json({ success: true, events });
  });

  app.post('/api/signal/emit', async (req, res) => {
    store.runMaintenance();
    const peer = authenticateHttpPeer(req);
    if (!peer) {
      return res.status(401).json({ success: false, reconnect: true, error: 'Session expired.' });
    }

    const body = (req.body ?? {}) as { event?: unknown; payload?: Record<string, unknown> };
    const event = typeof body.event === 'string' ? body.event : '';
    const payload = (body.payload ?? {}) as Record<string, unknown>;
    const immediateEvents: QueuedSignalEvent[] = [];

    if (event === 'peer:register') {
      if (store.registerLimiter.consume(peer.id).allowed) {
        peer.displayName = sanitizeText(payload.displayName, MAX_DISPLAY_NAME_LEN, peer.displayName);
        if (typeof payload.fingerprint === 'string' && /^[0-9a-fA-F]{6,16}$/.test(payload.fingerprint)) {
          peer.fingerprint = payload.fingerprint.toUpperCase();
        }
        if (typeof payload.signingPublicKey === 'string' && payload.signingPublicKey.length < 2048) {
          peer.signingPublicKey = payload.signingPublicKey;
        }
        if (typeof payload.ecdhPublicKey === 'string' && payload.ecdhPublicKey.length < 2048) {
          peer.ecdhPublicKey = payload.ecdhPublicKey;
        }
        store.notifyScopeChanged(peer.roomId);
      }
      const state = peer.roomId ? store.getRoomState(peer.roomId) : store.getLobbyState();
      if (state) {
        immediateEvents.push({ event: peer.roomId ? 'room:state' : 'lobby:state', payload: state });
      }
    } else if (event === 'room:join-request') {
      const rate = store.joinRequestLimiter.consume(`${peer.clientIp}:${peer.id}`);
      if (!rate.allowed) {
        immediateEvents.push({
          event: 'room:error',
          payload: { error: `Too many join attempts. Please wait ${rate.retryAfterSec}s.` },
        });
      } else {
        const rawId = typeof payload.roomId === 'string' ? payload.roomId.toUpperCase().trim() : '';
        const lockKey = `${peer.clientIp}:${rawId}`;
        const lockStatus = store.authLockout.check(lockKey);

        if (!isValidRoomId(rawId)) {
          immediateEvents.push({ event: 'room:error', payload: { error: 'Invalid room code format.' } });
        } else if (lockStatus.locked) {
          const mins = Math.max(1, Math.ceil(lockStatus.retryAfterSec / 60));
          immediateEvents.push({
            event: 'room:error',
            payload: { error: `Too many failed password attempts. Locked for ${mins} minute${mins === 1 ? '' : 's'}.` },
          });
        } else {
          const room = await store.getOrHydrateRoom(rawId);
          if (!room) {
            immediateEvents.push({ event: 'room:error', payload: { error: 'Room not found or expired.' } });
          } else if (room.expiresAt && Date.now() > room.expiresAt) {
            store.rooms.delete(rawId);
            await store.kv.deleteRoom(rawId);
            immediateEvents.push({ event: 'room:error', payload: { error: 'This room has expired.' } });
          } else if (!room.peers.has(peer.id) && room.peers.size >= MAX_PEERS_PER_ROOM) {
            immediateEvents.push({ event: 'room:error', payload: { error: 'This private room is full.' } });
          } else if (room.passwordVerifier) {
            const nonce = crypto.randomBytes(32).toString('hex');
            store.authChallenges.set(peer.id, {
              roomId: rawId,
              nonce,
              expiresAt: Date.now() + CHALLENGE_TTL_MS,
            });
            immediateEvents.push({
              event: 'room:challenge',
              payload: { roomId: rawId, roomName: room.name, nonce },
            });
          } else {
            if (peer.roomId && peer.roomId !== room.id) {
              store.removePeerFromCurrentRoom(peer.id);
            }
            peer.roomId = room.id;
            room.peers.add(peer.id);
            store.notifyScopeChanged(room.id);
            store.notifyScopeChanged(null);
            const joined = store.getRoomState(room.id);
            if (joined) immediateEvents.push({ event: 'room:joined', payload: joined });
          }
        }
      }
    } else if (event === 'room:auth-proof') {
      const challenge = store.authChallenges.get(peer.id);
      if (!challenge || Date.now() > challenge.expiresAt) {
        store.authChallenges.delete(peer.id);
        immediateEvents.push({
          event: 'room:error',
          payload: { error: 'Authentication challenge expired. Please try again.' },
        });
      } else {
        const roomId = typeof payload.roomId === 'string' ? payload.roomId.toUpperCase() : '';
        const lockKey = `${peer.clientIp}:${roomId}`;
        const lockStatus = store.authLockout.check(lockKey);
        if (roomId !== challenge.roomId) {
          store.authChallenges.delete(peer.id);
          immediateEvents.push({ event: 'room:error', payload: { error: 'Room mismatch during authentication.' } });
        } else if (lockStatus.locked) {
          store.authChallenges.delete(peer.id);
          const mins = Math.max(1, Math.ceil(lockStatus.retryAfterSec / 60));
          immediateEvents.push({
            event: 'room:error',
            payload: { error: `Too many failed password attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` },
          });
        } else {
          const room = await store.getOrHydrateRoom(roomId);
          const proof = typeof payload.proof === 'string' ? payload.proof.toLowerCase() : '';
          store.authChallenges.delete(peer.id);
          if (!room || !room.passwordVerifier) {
            immediateEvents.push({ event: 'room:error', payload: { error: 'Room no longer exists.' } });
          } else if (!verifyHmacProof(proof, room.passwordVerifier, challenge.nonce)) {
            const failure = store.authLockout.recordFailure(lockKey);
            immediateEvents.push({
              event: 'room:error',
              payload: {
                error: failure.locked
                  ? 'Incorrect password. Room access temporarily locked after repeated failures.'
                  : `Incorrect room password (${failure.attemptsRemaining} attempt${failure.attemptsRemaining === 1 ? '' : 's'} left).`,
              },
            });
          } else {
            store.authLockout.recordSuccess(lockKey);
            if (peer.roomId && peer.roomId !== room.id) {
              store.removePeerFromCurrentRoom(peer.id);
            }
            peer.roomId = room.id;
            room.peers.add(peer.id);
            store.notifyScopeChanged(room.id);
            store.notifyScopeChanged(null);
            const joined = store.getRoomState(room.id);
            if (joined) immediateEvents.push({ event: 'room:joined', payload: joined });
          }
        }
      }
    } else if (event === 'room:leave') {
      store.removePeerFromCurrentRoom(peer.id);
      store.notifyScopeChanged(null);
      immediateEvents.push({ event: 'room:left', payload: {} });
      immediateEvents.push({ event: 'lobby:state', payload: store.getLobbyState() });
    } else if (event === 'file:share') {
      if (!store.fileShareLimiter.consume(peer.id).allowed) {
        immediateEvents.push({ event: 'file:error', payload: { error: 'Sharing too quickly. Please wait a moment.' } });
      } else {
        const currentOwned = peer.roomId ? peer.roomFileIds.size : peer.lobbyFileIds.size;
        if (currentOwned >= MAX_FILES_PER_PEER) {
          immediateEvents.push({
            event: 'file:error',
            payload: { error: `Maximum ${MAX_FILES_PER_PEER} shared files per session reached.` },
          });
        } else {
          const name = sanitizeText(payload.name, MAX_FILE_NAME_LEN, 'untitled-file');
          const size = typeof payload.size === 'number' && Number.isFinite(payload.size) ? Math.floor(payload.size) : -1;
          if (size < 0 || size > MAX_FILE_SIZE_BYTES) {
            immediateEvents.push({ event: 'file:error', payload: { error: 'File size must be between 0 B and 2 GB.' } });
          } else {
            const mimeType = sanitizeText(payload.mimeType, 128, 'application/octet-stream');
            let expiresAt: number | null = null;
            if (typeof payload.expiresInMs === 'number' && Number.isFinite(payload.expiresInMs) && payload.expiresInMs > 0) {
              expiresAt = Date.now() + Math.min(payload.expiresInMs, 24 * 60 * 60 * 1000);
            }
            const fileId = `${peer.id.slice(0, 6)}-${crypto.randomBytes(6).toString('hex')}`;
            const meta: SharedFileMeta = {
              id: fileId,
              name,
              size,
              mimeType,
              peerId: peer.id,
              peerName: peer.displayName,
              peerFingerprint: peer.fingerprint,
              roomId: peer.roomId,
              sharedAt: Date.now(),
              expiresAt,
            };
            if (peer.roomId) {
              const room = store.rooms.get(peer.roomId);
              if (room) {
                room.files.set(fileId, meta);
                peer.roomFileIds.add(fileId);
                store.notifyScopeChanged(peer.roomId);
                immediateEvents.push({
                  event: 'file:confirmed',
                  payload: { clientTempId: typeof payload.clientTempId === 'string' ? payload.clientTempId : null, file: meta },
                });
              }
            } else {
              store.lobbyFiles.set(fileId, meta);
              peer.lobbyFileIds.add(fileId);
              store.notifyScopeChanged(null);
              immediateEvents.push({
                event: 'file:confirmed',
                payload: { clientTempId: typeof payload.clientTempId === 'string' ? payload.clientTempId : null, file: meta },
              });
            }
          }
        }
      }
    } else if (event === 'file:unshare') {
      const fileId = typeof payload.fileId === 'string' ? payload.fileId : '';
      if (fileId) {
        if (peer.roomId && peer.roomFileIds.has(fileId)) {
          store.rooms.get(peer.roomId)?.files.delete(fileId);
          peer.roomFileIds.delete(fileId);
          store.notifyScopeChanged(peer.roomId);
        } else if (peer.lobbyFileIds.has(fileId)) {
          store.lobbyFiles.delete(fileId);
          peer.lobbyFileIds.delete(fileId);
          store.notifyScopeChanged(null);
        }
      }
    } else if (event === 'file:unshare-all') {
      if (peer.roomId) {
        const room = store.rooms.get(peer.roomId);
        for (const fileId of peer.roomFileIds) {
          room?.files.delete(fileId);
        }
        peer.roomFileIds.clear();
        store.notifyScopeChanged(peer.roomId);
      } else {
        for (const fileId of peer.lobbyFileIds) {
          store.lobbyFiles.delete(fileId);
        }
        peer.lobbyFileIds.clear();
        store.notifyScopeChanged(null);
      }
    } else if (
      event === 'webrtc:offer' ||
      event === 'webrtc:answer' ||
      event === 'webrtc:ice' ||
      event === 'relay:request' ||
      event === 'relay:packet' ||
      event === 'relay:cancel'
    ) {
      const targetPeerId = typeof payload.targetPeerId === 'string' ? payload.targetPeerId : '';
      const transferId = typeof payload.transferId === 'string' ? payload.transferId : '';
      if (targetPeerId && transferId && store.canPeersCommunicate(peer.id, targetPeerId)) {
        const forwarded: Record<string, unknown> = { ...payload, fromPeerId: peer.id };
        delete forwarded.targetPeerId;
        store.enqueueToPeer(targetPeerId, event, forwarded);
      }
    }

    return res.json({ success: true, events: immediateEvents });
  });

  app.post('/api/signal/disconnect', (req, res) => {
    const peer = authenticateHttpPeer(req);
    if (peer) {
      store.disconnectPeer(peer.id);
    }
    return res.json({ success: true });
  });

  return { app, store };
}
