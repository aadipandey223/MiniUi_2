import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { createSignalingClient, type SignalingTransport } from '../lib/signalingClient.ts';
import type {
  ActiveUpload,
  PeerInfo,
  QueueItem,
  RoomJoinedPayload,
  RoomSummary,
  SchedulingAlgorithm,
  SharedFileMeta,
  TransferHistoryEntry,
} from '../../shared/types.ts';
import {
  computeChallengeProof,
  createLocalCryptoIdentity,
  derivePasswordVerifier,
  deriveRoomKey,
  runCryptoSelfTest,
  type CryptoSelfTestResult,
  type LocalCryptoIdentity,
} from '../lib/crypto.ts';
import { P2PTransferEngine } from '../lib/p2p.ts';
import { extractRoomIdFromInput } from '../../shared/security.ts';

export interface ToastItem {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export interface LocalSharedFile {
  id: string;
  file: File;
  meta: SharedFileMeta;
}

export interface CreatedRoomInvite {
  room: RoomSummary;
  shareLink: string;
  qrDataUrl: string;
  password: string;
}

const MAX_SPEED_SAMPLES = 30;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

function loadStoredAlias(): string {
  try {
    const saved = localStorage.getItem('vaultbeam_alias');
    if (saved && saved.trim()) return saved.trim().slice(0, 32);
  } catch {
    // Ignore storage access errors
  }
  return `Operator-${Math.floor(1000 + Math.random() * 9000)}`;
}

function sortWaitingItems(items: QueueItem[], algorithm: SchedulingAlgorithm): QueueItem[] {
  const active = items.filter((i) => i.status === 'running' || i.status === 'verifying');
  const waiting = items.filter((i) => i.status === 'waiting');

  waiting.sort((a, b) => {
    if (algorithm === 'SJF') {
      if (a.file.size !== b.file.size) return a.file.size - b.file.size;
      return a.arrivalTime - b.arrivalTime;
    }
    if (algorithm === 'Priority') {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.arrivalTime - b.arrivalTime;
    }
    return a.arrivalTime - b.arrivalTime;
  });

  return [...active, ...waiting];
}

export function useVaultBeam() {
  const [connected, setConnected] = useState(false);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [displayName, setDisplayNameState] = useState<string>(() => loadStoredAlias());
  const [identity, setIdentity] = useState<LocalCryptoIdentity | null>(null);

  const [activeRoom, setActiveRoom] = useState<RoomSummary | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [remoteFiles, setRemoteFiles] = useState<SharedFileMeta[]>([]);
  const [mySharedFiles, setMySharedFiles] = useState<LocalSharedFile[]>([]);
  const [incognito, setIncognito] = useState(false);
  const [defaultExpiryMs, setDefaultExpiryMs] = useState<number>(600_000); // 10 min default
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [inviteModalData, setInviteModalData] = useState<CreatedRoomInvite | null>(null);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinPrefillRoomId, setJoinPrefillRoomId] = useState('');
  const [joinPrefillRoomName, setJoinPrefillRoomName] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  // OS Queue, Semaphore & Telemetry
  const [schedulingAlgorithm, setSchedulingAlgorithmState] = useState<SchedulingAlgorithm>('FCFS');
  const [maxConcurrent, setMaxConcurrentState] = useState<number>(3);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [transferHistory, setTransferHistory] = useState<TransferHistoryEntry[]>([]);
  const [uploadSpeedHistory, setUploadSpeedHistory] = useState<number[]>(() => Array(MAX_SPEED_SAMPLES).fill(0));
  const [downloadSpeedHistory, setDownloadSpeedHistory] = useState<number[]>(() => Array(MAX_SPEED_SAMPLES).fill(0));
  const [peakSpeedBytes, setPeakSpeedBytes] = useState<number>(0);

  // Security self-test & Toasts
  const [selfTestResult, setSelfTestResult] = useState<CryptoSelfTestResult | null>(null);
  const [selfTestRunning, setSelfTestRunning] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Refs for stable access inside signaling / P2P callbacks
  const socketRef = useRef<SignalingTransport | null>(null);
  const engineRef = useRef<P2PTransferEngine | null>(null);
  const identityRef = useRef<LocalCryptoIdentity | null>(null);
  const roomKeyRef = useRef<CryptoKey | null>(null);
  const activeRoomRef = useRef<RoomSummary | null>(null);
  const displayNameRef = useRef<string>(displayName);
  const myPeerIdRef = useRef<string | null>(null);
  const localFilesMapRef = useRef<Map<string, File>>(new Map());
  const pendingJoinPasswordRef = useRef<string>('');
  const queueRef = useRef<QueueItem[]>([]);
  const maxConcurrentRef = useRef<number>(maxConcurrent);
  const schedulingAlgoRef = useRef<SchedulingAlgorithm>(schedulingAlgorithm);
  const activeUploadsRef = useRef<ActiveUpload[]>([]);
  const peersRef = useRef<PeerInfo[]>([]);
  const lastCreatedInviteRef = useRef<CreatedRoomInvite | null>(null);
  const preserveInviteModalRef = useRef(false);

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    maxConcurrentRef.current = maxConcurrent;
  }, [maxConcurrent]);

  useEffect(() => {
    schedulingAlgoRef.current = schedulingAlgorithm;
  }, [schedulingAlgorithm]);

  useEffect(() => {
    activeUploadsRef.current = activeUploads;
  }, [activeUploads]);

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Process waiting download queue up to semaphore maxConcurrent slots
  const dispatchNextQueued = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    setQueue((prev) => {
      const runningCount = prev.filter((q) => q.status === 'running' || q.status === 'verifying').length;
      const availableSlots = maxConcurrentRef.current - runningCount;
      if (availableSlots <= 0) return prev;

      const sorted = sortWaitingItems(prev, schedulingAlgoRef.current);
      const toStart: QueueItem[] = [];
      const updated = sorted.map((item) => {
        if (item.status === 'waiting' && toStart.length < availableSlots) {
          const started: QueueItem = {
            ...item,
            status: 'running',
            startTime: Date.now(),
          };
          toStart.push(started);
          return started;
        }
        return item;
      });

      if (toStart.length === 0) return prev;

      // Kick off actual P2P downloads asynchronously outside state reducer
      queueMicrotask(() => {
        for (const job of toStart) {
          const senderPeer = peersRef.current.find((p) => p.id === job.file.peerId);
          engine
            .startDownload({
              transferId: job.queueId,
              fileId: job.file.id,
              targetPeerId: job.file.peerId,
              expectedSenderSigningPublicKey: senderPeer?.signingPublicKey || undefined,
              expectedSenderEcdhPublicKey: senderPeer?.ecdhPublicKey || undefined,
              onProgress: (info) => {
                setPeakSpeedBytes((peak) => Math.max(peak, info.speedBytesPerSec));
                setQueue((curr) =>
                  curr.map((q) =>
                    q.queueId === job.queueId
                      ? {
                          ...q,
                          progress: info.progress,
                          bytesTransferred: info.bytesReceived,
                          speedBytesPerSec: info.speedBytesPerSec,
                          transport: info.transport,
                          firstByteTime: q.firstByteTime ?? info.firstByteTime ?? null,
                        }
                      : q
                  )
                );
              },
              onVerifying: () => {
                setQueue((curr) =>
                  curr.map((q) =>
                    q.queueId === job.queueId ? { ...q, status: 'verifying', progress: 99 } : q
                  )
                );
              },
            })
            .then((completed) => {
              const finishedAt = Date.now();
              const startedAt = job.startTime ?? finishedAt;
              const waitSec = Math.max(0, (startedAt - job.arrivalTime) / 1000);
              const turnaroundSec = Math.max(0.05, (finishedAt - job.arrivalTime) / 1000);

              setPeakSpeedBytes((peak) => Math.max(peak, completed.avgSpeedBytesPerSec));
              setQueue((curr) => curr.filter((q) => q.queueId !== job.queueId));
              setTransferHistory((hist) => [
                {
                  id: job.queueId,
                  fileName: completed.fileName,
                  size: completed.size,
                  direction: 'download',
                  durationSec: completed.durationSec,
                  avgSpeedBytesPerSec: completed.avgSpeedBytesPerSec,
                  waitTimeSec: waitSec,
                  turnaroundTimeSec: turnaroundSec,
                  algorithm: schedulingAlgoRef.current,
                  transport: completed.transport,
                  verified: completed.verified,
                  status: 'completed',
                  timestamp: finishedAt,
                },
                ...hist.slice(0, 49),
              ]);
              pushToast(`Verified & saved ${completed.fileName}`, 'success');
              setTimeout(() => dispatchNextQueued(), 20);
            })
            .catch((err: Error) => {
              const finishedAt = Date.now();
              const isCancel = err.message === 'Transfer cancelled';
              setQueue((curr) => curr.filter((q) => q.queueId !== job.queueId));
              if (!isCancel) {
                setTransferHistory((hist) => [
                  {
                    id: job.queueId,
                    fileName: job.file.name,
                    size: job.file.size,
                    direction: 'download',
                    durationSec: Math.max(0.1, (finishedAt - (job.startTime ?? finishedAt)) / 1000),
                    avgSpeedBytesPerSec: 0,
                    waitTimeSec: Math.max(0, ((job.startTime ?? finishedAt) - job.arrivalTime) / 1000),
                    turnaroundTimeSec: Math.max(0.1, (finishedAt - job.arrivalTime) / 1000),
                    algorithm: schedulingAlgoRef.current,
                    transport: job.transport ?? 'webrtc',
                    verified: false,
                    status: 'failed',
                    error: err.message,
                    timestamp: finishedAt,
                  },
                  ...hist.slice(0, 49),
                ]);
                pushToast(`Transfer failed: ${err.message}`, 'error');
              }
              setTimeout(() => dispatchNextQueued(), 20);
            });
        }
      });

      return updated;
    });
  }, [pushToast]);

  // Initialize Web Crypto identity + Adaptive Signaling (Socket.IO / Vercel Serverless HTTP) + P2P Engine once
  useEffect(() => {
    let mounted = true;
    const socket = createSignalingClient();
    socketRef.current = socket;

    const engine = new P2PTransferEngine({
      socket,
      getIdentity: () => identityRef.current,
      getRoomKey: () => roomKeyRef.current,
      getLocalFile: (fileId) => localFilesMapRef.current.get(fileId),
      onUploadProgress: (info) => {
        setPeakSpeedBytes((peak) => Math.max(peak, info.speedBytesPerSec));
        setActiveUploads((prev) => {
          const exists = prev.some((u) => u.transferId === info.transferId);
          if (exists) {
            return prev.map((u) =>
              u.transferId === info.transferId
                ? {
                    ...u,
                    progress: info.progress,
                    bytesSent: info.bytesSent,
                    speedBytesPerSec: info.speedBytesPerSec,
                    transport: info.transport,
                  }
                : u
            );
          }
          return [
            ...prev,
            {
              transferId: info.transferId,
              fileId: info.fileId,
              fileName: info.fileName,
              fileSize: info.fileSize,
              targetPeerId: info.targetPeerId,
              progress: info.progress,
              bytesSent: info.bytesSent,
              speedBytesPerSec: info.speedBytesPerSec,
              transport: info.transport,
              startedAt: Date.now(),
            },
          ];
        });
      },
      onUploadComplete: (info) => {
        setActiveUploads((prev) => prev.filter((u) => u.transferId !== info.transferId));
        setTransferHistory((hist) => [
          {
            id: info.transferId,
            fileName: info.fileName,
            size: info.size,
            direction: 'upload',
            durationSec: info.durationSec,
            avgSpeedBytesPerSec: info.avgSpeedBytesPerSec,
            waitTimeSec: 0,
            turnaroundTimeSec: info.durationSec,
            algorithm: null,
            transport: info.transport,
            verified: true,
            status: 'completed',
            timestamp: Date.now(),
          },
          ...hist.slice(0, 49),
        ]);
        pushToast(`Encrypted upload complete: ${info.fileName}`, 'success');
      },
      onUploadError: (transferId, message) => {
        setActiveUploads((prev) => prev.filter((u) => u.transferId !== transferId));
        pushToast(`Upload failed: ${message}`, 'error');
      },
    });
    engineRef.current = engine;

    const emitIdentity = (id: LocalCryptoIdentity) => {
      if (socket.connected) {
        socket.emit('peer:register', {
          displayName: displayNameRef.current,
          fingerprint: id.fingerprint,
          signingPublicKey: id.signingPublicKeyBase64,
          ecdhPublicKey: id.ecdhPublicKeyBase64,
        });
      }
    };

    createLocalCryptoIdentity()
      .then((created) => {
        if (!mounted) return;
        identityRef.current = created;
        setIdentity(created);
        emitIdentity(created);
      })
      .catch((err) => {
        console.error('Failed to initialize Web Crypto identity:', err);
        pushToast('Web Crypto API unavailable in this browser context.', 'error');
      });

    socket.on('connect', () => {
      if (!mounted) return;
      myPeerIdRef.current = socket.id ?? null;
      setMyPeerId(socket.id ?? null);
      setConnected(true);
      if (identityRef.current) {
        emitIdentity(identityRef.current);
      }

      // Auto-check /room/:roomId deep link on first connect
      const match = window.location.pathname.match(/^\/room\/([A-Za-z0-9]{6,16})\/?$/);
      if (match && !activeRoomRef.current) {
        const roomIdFromUrl = match[1].toUpperCase();
        fetch(`/api/rooms/${roomIdFromUrl}`)
          .then((r) => r.json())
          .then((data: { success: boolean; room?: RoomSummary; error?: string }) => {
            if (!mounted) return;
            if (!data.success || !data.room) {
              pushToast(data.error || 'Room link is no longer active.', 'warning');
              window.history.replaceState({}, '', '/');
              return;
            }
            if (data.room.requiresPassword) {
              setJoinPrefillRoomId(data.room.id);
              setJoinPrefillRoomName(data.room.name);
              setJoinModalOpen(true);
            } else {
              void deriveRoomKey(data.room.id, '').then((key) => {
                roomKeyRef.current = key;
                socket.emit('room:join-request', { roomId: data.room!.id });
              });
            }
          })
          .catch(() => {
            pushToast('Could not verify room link.', 'error');
          });
      }
    });

    socket.on('disconnect', () => {
      if (!mounted) return;
      setConnected(false);
    });

    socket.on('lobby:state', (payload: { peers: PeerInfo[]; files: SharedFileMeta[] }) => {
      if (!mounted || activeRoomRef.current) return;
      setPeers(payload.peers);
      setRemoteFiles(payload.files.filter((f) => f.peerId !== socket.id));
    });

    socket.on('room:state', (payload: RoomJoinedPayload) => {
      if (!mounted) return;
      setActiveRoom(payload.room);
      setPeers(payload.peers);
      setRemoteFiles(payload.files.filter((f) => f.peerId !== socket.id));
    });

    socket.on('room:challenge', async (payload: { roomId: string; roomName: string; nonce: string }) => {
      try {
        const password = pendingJoinPasswordRef.current;
        if (!password) {
          setJoinBusy(false);
          setJoinPrefillRoomId(payload.roomId);
          setJoinPrefillRoomName(payload.roomName);
          setJoinError('Password required to enter this private room.');
          setJoinModalOpen(true);
          return;
        }
        const verifier = await derivePasswordVerifier(payload.roomId, password);
        const proof = await computeChallengeProof(verifier, payload.nonce);
        socket.emit('room:auth-proof', { roomId: payload.roomId, proof });
      } catch {
        setJoinBusy(false);
        setJoinError('Failed to compute cryptographic authentication proof.');
      }
    });

    socket.on('room:joined', (payload: RoomJoinedPayload) => {
      if (!mounted) return;
      setActiveRoom(payload.room);
      setPeers(payload.peers);
      setRemoteFiles(payload.files.filter((f) => f.peerId !== socket.id));
      setJoinBusy(false);
      setJoinError(null);
      setJoinModalOpen(false);
      setJoinPrefillRoomName(null);
      if (preserveInviteModalRef.current) {
        preserveInviteModalRef.current = false;
      } else {
        setInviteModalData(null);
      }
      pendingJoinPasswordRef.current = '';
      if (window.location.pathname !== `/room/${payload.room.id}`) {
        window.history.pushState({}, '', `/room/${payload.room.id}`);
      }
      pushToast(`Entered encrypted vault ${payload.room.name}`, 'success');
    });

    socket.on('room:left', () => {
      if (!mounted) return;
      setActiveRoom(null);
      roomKeyRef.current = null;
      if (window.location.pathname !== '/') {
        window.history.pushState({}, '', '/');
      }
    });

    socket.on('room:expired', () => {
      if (!mounted) return;
      setActiveRoom(null);
      roomKeyRef.current = null;
      setMySharedFiles((prev) => prev.filter((item) => item.meta.roomId === null));
      if (window.location.pathname !== '/') {
        window.history.pushState({}, '', '/');
      }
      pushToast('Private room expired and was closed.', 'warning');
    });

    socket.on('room:error', (payload: { error: string }) => {
      if (!mounted) return;
      setJoinBusy(false);
      setJoinError(payload.error || 'Unable to join room.');
      pushToast(payload.error || 'Room error', 'error');
    });

    socket.on('file:confirmed', (payload: { clientTempId: string | null; file: SharedFileMeta }) => {
      if (!mounted) return;
      const { clientTempId, file } = payload;
      if (clientTempId && localFilesMapRef.current.has(clientTempId)) {
        const rawFile = localFilesMapRef.current.get(clientTempId)!;
        localFilesMapRef.current.delete(clientTempId);
        localFilesMapRef.current.set(file.id, rawFile);
      }
      setMySharedFiles((prev) =>
        prev.map((entry) => (entry.id === clientTempId ? { ...entry, id: file.id, meta: file } : entry))
      );
    });

    socket.on('file:error', (payload: { error: string }) => {
      if (!mounted) return;
      pushToast(payload.error || 'Could not share file.', 'error');
    });

    return () => {
      mounted = false;
      engine.dispose();
      socket.disconnect();
    };
  }, [pushToast]);

  // 1-second telemetry ticker (speed history + live file expiry countdowns)
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);

      // Aggregate real live speeds in MB/s
      const downBytes = queueRef.current
        .filter((q) => q.status === 'running')
        .reduce((acc, q) => acc + q.speedBytesPerSec, 0);
      const upBytes = activeUploadsRef.current.reduce((acc, u) => acc + u.speedBytesPerSec, 0);

      setDownloadSpeedHistory((prev) => [...prev.slice(1), downBytes / (1024 * 1024)]);
      setUploadSpeedHistory((prev) => [...prev.slice(1), upBytes / (1024 * 1024)]);

      // Expire owned local files whose countdown hit 0
      setMySharedFiles((prev) => {
        const expired = prev.filter((item) => item.meta.expiresAt && now >= item.meta.expiresAt);
        if (expired.length === 0) return prev;
        for (const item of expired) {
          localFilesMapRef.current.delete(item.id);
          socketRef.current?.emit('file:unshare', { fileId: item.id });
          pushToast(`Shared file expired: ${item.meta.name}`, 'warning');
        }
        return prev.filter((item) => !item.meta.expiresAt || now < item.meta.expiresAt);
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [pushToast]);

  // Actions
  const updateDisplayName = useCallback((nextName: string) => {
    const clean = nextName.trim().slice(0, 32) || 'Operator';
    setDisplayNameState(clean);
    displayNameRef.current = clean;
    try {
      localStorage.setItem('vaultbeam_alias', clean);
    } catch {
      // Ignore
    }
    if (socketRef.current?.connected && identityRef.current) {
      socketRef.current.emit('peer:register', {
        displayName: clean,
        fingerprint: identityRef.current.fingerprint,
        signingPublicKey: identityRef.current.signingPublicKeyBase64,
        ecdhPublicKey: identityRef.current.ecdhPublicKeyBase64,
      });
    }
  }, []);

  const shareFiles = useCallback(
    (files: File[]) => {
      if (!socketRef.current?.connected) {
        pushToast('Not connected to signaling server.', 'error');
        return;
      }
      let sharedCount = 0;
      let skippedCount = 0;
      const scopeRoomId = activeRoomRef.current?.id ?? null;

      for (const file of files) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          skippedCount++;
          continue;
        }
        const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        localFilesMapRef.current.set(tempId, file);

        const optimisticMeta: SharedFileMeta = {
          id: tempId,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          peerId: myPeerIdRef.current ?? '',
          peerName: displayNameRef.current,
          peerFingerprint: identityRef.current?.fingerprint ?? '',
          roomId: scopeRoomId,
          sharedAt: Date.now(),
          expiresAt: defaultExpiryMs > 0 ? Date.now() + defaultExpiryMs : null,
        };

        setMySharedFiles((prev) => [{ id: tempId, file, meta: optimisticMeta }, ...prev]);
        socketRef.current.emit('file:share', {
          clientTempId: tempId,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          expiresInMs: defaultExpiryMs,
        });
        sharedCount++;
      }

      if (sharedCount > 0) {
        pushToast(
          sharedCount === 1 ? `Sharing ${files[0].name}` : `Sharing ${sharedCount} files`,
          'success'
        );
      }
      if (skippedCount > 0) {
        pushToast(`${skippedCount} file(s) skipped (exceeds 2 GB limit).`, 'warning');
      }
    },
    [defaultExpiryMs, pushToast]
  );

  const unshareFile = useCallback(
    (fileId: string) => {
      localFilesMapRef.current.delete(fileId);
      setMySharedFiles((prev) => prev.filter((item) => item.id !== fileId));
      socketRef.current?.emit('file:unshare', { fileId });
      pushToast('File removed from share list', 'info');
    },
    [pushToast]
  );

  const unshareAllFiles = useCallback(() => {
    const scopeRoomId = activeRoomRef.current?.id ?? null;
    setMySharedFiles((prev) => {
      for (const item of prev) {
        if (item.meta.roomId === scopeRoomId) {
          localFilesMapRef.current.delete(item.id);
        }
      }
      return prev.filter((item) => item.meta.roomId !== scopeRoomId);
    });
    socketRef.current?.emit('file:unshare-all');
    pushToast('Cleared all shared files in current workspace', 'info');
  }, [pushToast]);

  const joinRoom = useCallback(
    async (roomId: string, password: string, options?: { preserveInviteModal?: boolean }) => {
      const cleanId = extractRoomIdFromInput(roomId);
      if (!cleanId || cleanId.length < 6) {
        setJoinError('Enter a valid room code or share link.');
        return;
      }
      setJoinBusy(true);
      setJoinError(null);
      preserveInviteModalRef.current = Boolean(options?.preserveInviteModal);
      try {
        pendingJoinPasswordRef.current = password;
        roomKeyRef.current = await deriveRoomKey(cleanId, password);
        socketRef.current?.emit('room:join-request', { roomId: cleanId });
      } catch {
        preserveInviteModalRef.current = false;
        setJoinBusy(false);
        setJoinError('Failed to derive room encryption key.');
      }
    },
    []
  );

  const createPrivateRoom = useCallback(
    async (params: { name: string; password: string; expiresInMs: number | null }) => {
      const reserveRes = await fetch('/api/rooms/reserve-id');
      const reserveData = (await reserveRes.json()) as { success: boolean; roomId?: string; error?: string };
      if (!reserveData.success || !reserveData.roomId) {
        throw new Error(reserveData.error || 'Could not reserve room code.');
      }
      const roomId = reserveData.roomId;
      const passwordVerifier = params.password
        ? await derivePasswordVerifier(roomId, params.password)
        : null;

      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          name: params.name.trim() || `Room ${roomId.slice(0, 4)}`,
          passwordVerifier,
          expiresInMs: params.expiresInMs,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        room?: RoomSummary;
        shareLink?: string;
        error?: string;
      };
      if (!data.success || !data.room) {
        throw new Error(data.error || 'Failed to create room.');
      }

      // Always prefer browser origin so share links & QR codes match the exact reachable URL
      const shareLink = `${window.location.origin}/room/${data.room.id}`;
      const qrDataUrl = await QRCode.toDataURL(shareLink, {
        width: 220,
        margin: 2,
        color: {
          dark: '#14110B',
          light: '#FFFFFF',
        },
      });

      const invite: CreatedRoomInvite = {
        room: data.room,
        shareLink,
        qrDataUrl,
        password: params.password,
      };
      lastCreatedInviteRef.current = invite;
      setCreateModalOpen(false);
      setInviteModalData(invite);

      // Immediately enter the creator into the newly created Private Room (activating the mineral vault theme)
      await joinRoom(data.room.id, params.password, { preserveInviteModal: true });
    },
    [joinRoom]
  );

  const openCurrentRoomInvite = useCallback(async () => {
    const room = activeRoomRef.current;
    if (!room) return;
    const shareLink = `${window.location.origin}/room/${room.id}`;
    const qrDataUrl = await QRCode.toDataURL(shareLink, {
      width: 220,
      margin: 2,
      color: {
        dark: '#14110B',
        light: '#FFFFFF',
      },
    });
    setInviteModalData({
      room,
      shareLink,
      qrDataUrl,
      password: '',
    });
  }, []);

  const leaveRoom = useCallback(() => {
    const roomId = activeRoomRef.current?.id;
    if (!roomId) return;

    // Cancel running downloads belonging to this room
    for (const item of queueRef.current) {
      if (item.file.roomId === roomId && (item.status === 'running' || item.status === 'verifying')) {
        engineRef.current?.cancelDownload(item.queueId);
      }
    }
    setQueue((prev) => prev.filter((item) => item.file.roomId !== roomId));

    // Remove room-scoped local shared files
    setMySharedFiles((prev) => {
      for (const item of prev) {
        if (item.meta.roomId === roomId) {
          localFilesMapRef.current.delete(item.id);
        }
      }
      return prev.filter((item) => item.meta.roomId !== roomId);
    });

    roomKeyRef.current = null;
    socketRef.current?.emit('room:leave');
    setActiveRoom(null);
    setLeaveConfirmOpen(false);
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    pushToast('Returned to open lobby', 'info');
  }, [pushToast]);

  const enqueueDownload = useCallback(
    (file: SharedFileMeta, priority = 5) => {
      const alreadyQueued = queueRef.current.some(
        (q) => q.file.id === file.id && (q.status === 'waiting' || q.status === 'running' || q.status === 'verifying')
      );
      if (alreadyQueued) {
        pushToast(`${file.name} is already in the transfer queue`, 'warning');
        return;
      }

      const item: QueueItem = {
        queueId: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        priority,
        arrivalTime: Date.now(),
        startTime: null,
        firstByteTime: null,
        endTime: null,
        status: 'waiting',
        progress: 0,
        bytesTransferred: 0,
        speedBytesPerSec: 0,
        transport: null,
        verified: false,
      };

      setQueue((prev) => sortWaitingItems([...prev, item], schedulingAlgoRef.current));
      pushToast(`Queued ${file.name}`, 'info');
      setTimeout(() => dispatchNextQueued(), 20);
    },
    [dispatchNextQueued, pushToast]
  );

  const enqueueBatchDownloads = useCallback(
    (files: SharedFileMeta[], priority = 5) => {
      let added = 0;
      setQueue((prev) => {
        const existingIds = new Set(prev.map((q) => q.file.id));
        const nextItems: QueueItem[] = [...prev];
        files.forEach((file, idx) => {
          if (existingIds.has(file.id)) return;
          added++;
          nextItems.push({
            queueId: `dl-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            file,
            priority,
            arrivalTime: Date.now() + idx,
            startTime: null,
            firstByteTime: null,
            endTime: null,
            status: 'waiting',
            progress: 0,
            bytesTransferred: 0,
            speedBytesPerSec: 0,
            transport: null,
            verified: false,
          });
        });
        return sortWaitingItems(nextItems, schedulingAlgoRef.current);
      });
      if (added > 0) {
        pushToast(`Queued ${added} file(s) for encrypted transfer`, 'success');
        setTimeout(() => dispatchNextQueued(), 20);
      }
    },
    [dispatchNextQueued, pushToast]
  );

  const setSchedulingAlgorithm = useCallback(
    (algo: SchedulingAlgorithm) => {
      schedulingAlgoRef.current = algo;
      setSchedulingAlgorithmState(algo);
      setQueue((prev) => sortWaitingItems(prev, algo));
      pushToast(`Queue scheduler set to ${algo}`, 'info');
    },
    [pushToast]
  );

  const setMaxConcurrent = useCallback(
    (limit: number) => {
      const clamped = Math.max(1, Math.min(6, limit));
      maxConcurrentRef.current = clamped;
      setMaxConcurrentState(clamped);
      setTimeout(() => dispatchNextQueued(), 20);
    },
    [dispatchNextQueued]
  );

  const boostQueueItem = useCallback(
    (queueId: string) => {
      schedulingAlgoRef.current = 'Priority';
      setSchedulingAlgorithmState('Priority');
      setQueue((prev) => {
        const highestPriority = prev.reduce((max, item) => Math.max(max, item.priority), 10);
        const boosted = prev.map((item) =>
          item.queueId === queueId ? { ...item, priority: highestPriority + 1 } : item
        );
        return sortWaitingItems(boosted, 'Priority');
      });
      pushToast('Promoted item to front of queue', 'info');
    },
    [pushToast]
  );

  const reorderWaitingQueue = useCallback((draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    schedulingAlgoRef.current = 'Priority';
    setSchedulingAlgorithmState('Priority');
    setQueue((prev) => {
      const active = prev.filter((q) => q.status !== 'waiting');
      const waiting = prev.filter((q) => q.status === 'waiting');
      const fromIdx = waiting.findIndex((q) => q.queueId === draggedId);
      const toIdx = waiting.findIndex((q) => q.queueId === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;

      const reordered = [...waiting];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);

      const withPriorities = reordered.map((item, idx) => ({
        ...item,
        priority: reordered.length - idx + 10,
      }));
      return [...active, ...withPriorities];
    });
  }, []);

  const cancelQueueItem = useCallback(
    (queueId: string) => {
      const item = queueRef.current.find((q) => q.queueId === queueId);
      if (!item) return;
      if (item.status === 'running' || item.status === 'verifying') {
        engineRef.current?.cancelDownload(queueId);
      }
      setQueue((prev) => prev.filter((q) => q.queueId !== queueId));
      pushToast(`Removed ${item.file.name} from queue`, 'info');
      setTimeout(() => dispatchNextQueued(), 20);
    },
    [dispatchNextQueued, pushToast]
  );

  const executeCryptoSelfTest = useCallback(async () => {
    if (!identityRef.current) return;
    setSelfTestRunning(true);
    try {
      const result = await runCryptoSelfTest(identityRef.current, roomKeyRef.current);
      setSelfTestResult(result);
      pushToast(
        result.passed
          ? `Triple-layer verification passed in ${result.durationMs}ms`
          : 'Cryptographic self-test detected a mismatch',
        result.passed ? 'success' : 'error'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Self-test failed', 'error');
    } finally {
      setSelfTestRunning(false);
    }
  }, [pushToast]);

  // Derived metrics & scoped files
  const scopedMyFiles = useMemo(() => {
    const targetRoomId = activeRoom?.id ?? null;
    return mySharedFiles.filter((item) => item.meta.roomId === targetRoomId);
  }, [mySharedFiles, activeRoom]);

  const metrics = useMemo(() => {
    const runningDownloads = queue.filter((q) => q.status === 'running' || q.status === 'verifying');
    const waitingDownloads = queue.filter((q) => q.status === 'waiting');
    const currentDownloadSpeed = runningDownloads.reduce((sum, q) => sum + q.speedBytesPerSec, 0);
    const currentUploadSpeed = activeUploads.reduce((sum, u) => sum + u.speedBytesPerSec, 0);

    const completedDownloads = transferHistory.filter(
      (h) => h.direction === 'download' && h.status === 'completed'
    );
    const avgWaitTimeSec =
      completedDownloads.length > 0
        ? completedDownloads.reduce((sum, h) => sum + h.waitTimeSec, 0) / completedDownloads.length
        : 0;
    const avgTurnaroundSec =
      completedDownloads.length > 0
        ? completedDownloads.reduce((sum, h) => sum + h.turnaroundTimeSec, 0) / completedDownloads.length
        : 0;

    const oneMinuteAgo = nowMs - 60_000;
    const recentCompleted = transferHistory.filter(
      (h) => h.status === 'completed' && h.timestamp >= oneMinuteAgo
    ).length;

    const activeSlotCount = runningDownloads.length;
    const utilizationPct = Math.round((activeSlotCount / maxConcurrent) * 100);

    return {
      activeSlotCount,
      waitingCount: waitingDownloads.length,
      currentDownloadSpeed,
      currentUploadSpeed,
      peakSpeedBytes,
      avgWaitTimeSec,
      avgTurnaroundSec,
      throughputPerMin: recentCompleted,
      utilizationPct,
      verifiedCount: transferHistory.filter((h) => h.verified && h.status === 'completed').length,
    };
  }, [queue, activeUploads, transferHistory, maxConcurrent, peakSpeedBytes, nowMs]);

  return {
    connected,
    myPeerId,
    displayName,
    updateDisplayName,
    identity,
    activeRoom,
    peers,
    remoteFiles,
    mySharedFiles: scopedMyFiles,
    incognito,
    setIncognito,
    defaultExpiryMs,
    setDefaultExpiryMs,
    nowMs,

    // Modals
    createModalOpen,
    setCreateModalOpen,
    inviteModalData,
    setInviteModalData,
    joinModalOpen,
    setJoinModalOpen,
    joinPrefillRoomId,
    setJoinPrefillRoomId,
    joinPrefillRoomName,
    setJoinPrefillRoomName,
    joinError,
    setJoinError,
    joinBusy,
    leaveConfirmOpen,
    setLeaveConfirmOpen,

    // Actions
    shareFiles,
    unshareFile,
    unshareAllFiles,
    createPrivateRoom,
    openCurrentRoomInvite,
    joinRoom,
    leaveRoom,
    enqueueDownload,
    enqueueBatchDownloads,
    schedulingAlgorithm,
    setSchedulingAlgorithm,
    maxConcurrent,
    setMaxConcurrent,
    boostQueueItem,
    reorderWaitingQueue,
    cancelQueueItem,
    executeCryptoSelfTest,

    // Live data
    queue,
    activeUploads,
    transferHistory,
    uploadSpeedHistory,
    downloadSpeedHistory,
    metrics,
    selfTestResult,
    selfTestRunning,
    toasts,
    pushToast,
    dismissToast,
  };
}
