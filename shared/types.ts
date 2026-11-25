export type SchedulingAlgorithm = 'FCFS' | 'SJF' | 'Priority';

export type TransferTransport = 'webrtc' | 'relay';

export type QueueItemStatus = 'waiting' | 'running' | 'verifying' | 'completed' | 'failed';

export type WorkspaceTab = 'workspace' | 'queue' | 'history' | 'security';

export interface PeerCryptoKeys {
  signingPublicKey: string; // SPKI base64 (ECDSA P-256)
  ecdhPublicKey: string; // SPKI base64 (ECDH P-256)
  fingerprint: string; // 8-char SHA-256 hex prefix
}

export interface PeerInfo {
  id: string;
  displayName: string;
  fingerprint: string;
  signingPublicKey: string;
  ecdhPublicKey: string;
  joinedAt: number;
}

export interface SharedFileMeta {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  peerId: string;
  peerName: string;
  peerFingerprint: string;
  roomId: string | null;
  sharedAt: number;
  expiresAt: number | null;
}

export interface RoomSummary {
  id: string;
  name: string;
  requiresPassword: boolean;
  peerCount: number;
  fileCount: number;
  createdAt: number;
  expiresAt: number | null;
}

export interface RoomJoinedPayload {
  room: RoomSummary;
  peers: PeerInfo[];
  files: SharedFileMeta[];
}

export interface QueueItem {
  queueId: string;
  file: SharedFileMeta;
  priority: number; // 1 = Low, 5 = Normal, 10 = High (or custom drag order)
  arrivalTime: number;
  startTime: number | null;
  firstByteTime: number | null;
  endTime: number | null;
  status: QueueItemStatus;
  progress: number; // 0..100
  bytesTransferred: number;
  speedBytesPerSec: number;
  transport: TransferTransport | null;
  verified: boolean;
  error?: string;
}

export interface ActiveUpload {
  transferId: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  targetPeerId: string;
  progress: number;
  bytesSent: number;
  speedBytesPerSec: number;
  transport: TransferTransport;
  startedAt: number;
}

export interface TransferHistoryEntry {
  id: string;
  fileName: string;
  size: number;
  direction: 'upload' | 'download';
  durationSec: number;
  avgSpeedBytesPerSec: number;
  waitTimeSec: number;
  turnaroundTimeSec: number;
  algorithm: SchedulingAlgorithm | null;
  transport: TransferTransport;
  verified: boolean;
  status: 'completed' | 'failed';
  error?: string;
  timestamp: number;
}

export interface EncryptedManifest {
  transferId: string;
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  chunkSize: number;
  keyWrapMode: 'room' | 'ecdh';
  wrappedSessionKey: string; // base64 AES-GCM ciphertext of raw L1 key
  wrappedSessionKeyIv: string; // base64 12-byte IV
  senderEcdhPublicKey: string; // SPKI base64
  senderSigningPublicKey: string; // SPKI base64
  senderFingerprint: string;
}

export interface EncryptedChunkPacket {
  transferId: string;
  index: number;
  iv: string; // base64 12-byte IV
  ciphertext: string; // base64 AES-GCM ciphertext
}

export interface TransferFinalizePacket {
  transferId: string;
  chainRootHex: string;
  totalChunks: number;
  signature: string; // base64 ECDSA P-256 signature over canonical manifest+root
}
