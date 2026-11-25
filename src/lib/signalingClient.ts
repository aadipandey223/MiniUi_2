import { io, type Socket } from 'socket.io-client';

export type SignalHandler = (...args: any[]) => void;

export interface SignalingTransport {
  readonly id: string | undefined;
  readonly connected: boolean;
  readonly mode: 'socketio' | 'serverless';
  on(event: string, handler: SignalHandler): void;
  off(event: string, handler: SignalHandler): void;
  emit(event: string, payload?: unknown): void;
  disconnect(): void;
}

interface QueuedEvent {
  event: string;
  payload: unknown;
}

const ACTIVE_SIGNAL_EVENTS = new Set([
  'webrtc:offer',
  'webrtc:answer',
  'webrtc:ice',
  'relay:request',
  'relay:packet',
  'relay:cancel',
]);

const FAST_POLL_MS = 380;
const IDLE_POLL_MS = 1400;
const FAST_POLL_BOOST_MS = 10_000;

/**
 * Authenticated HTTP Signaling transport for Vercel Serverless deployments
 * (where persistent WebSockets are unavailable). Keeps peerToken strictly in memory.
 */
class HttpSignalingClient implements SignalingTransport {
  private peerId: string | undefined = undefined;
  private peerToken: string | null = null;
  private isConnected = false;
  private disposed = false;
  private pollTimer: number | null = null;
  private pollingInFlight = false;
  private fastPollUntil = 0;
  private listeners = new Map<string, Set<SignalHandler>>();
  private onPageHideBound: () => void;

  constructor(private readonly baseUrl = '') {
    this.onPageHideBound = () => {
      this.sendDisconnectBeacon();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHideBound);
    }
    void this.connect();
  }

  public get id(): string | undefined {
    return this.peerId;
  }

  public get connected(): boolean {
    return this.isConnected;
  }

  public get mode(): 'serverless' {
    return 'serverless';
  }

  public on(event: string, handler: SignalHandler): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  public off(event: string, handler: SignalHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  private dispatch(event: string, payload?: unknown): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of Array.from(handlers)) {
      try {
        if (payload === undefined) {
          handler();
        } else {
          handler(payload);
        }
      } catch (err) {
        console.error(`Signaling listener error on "${event}":`, err);
      }
    }
  }

  private dispatchBatch(events: QueuedEvent[] | undefined): void {
    if (!Array.isArray(events)) return;
    for (const item of events) {
      if (ACTIVE_SIGNAL_EVENTS.has(item.event)) {
        this.fastPollUntil = Date.now() + FAST_POLL_BOOST_MS;
      }
      this.dispatch(item.event, item.payload);
    }
  }

  private async connect(): Promise<void> {
    if (this.disposed) return;
    try {
      const res = await fetch(`${this.baseUrl}/api/signal/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`Connect HTTP ${res.status}`);
      const data = (await res.json()) as {
        success: boolean;
        peerId?: string;
        peerToken?: string;
        lobby?: unknown;
      };
      if (!data.success || !data.peerId || !data.peerToken || this.disposed) {
        throw new Error('Invalid signaling session response.');
      }

      this.peerId = data.peerId;
      this.peerToken = data.peerToken;
      this.isConnected = true;
      this.dispatch('connect');
      if (data.lobby) {
        this.dispatch('lobby:state', data.lobby);
      }
      this.scheduleNextPoll(FAST_POLL_MS);
    } catch {
      if (this.disposed) return;
      if (this.isConnected) {
        this.isConnected = false;
        this.dispatch('disconnect');
      }
      this.scheduleNextPoll(2000, true);
    }
  }

  private scheduleNextPoll(delayMs?: number, isReconnect = false): void {
    if (this.disposed) return;
    if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer);
    }
    const interval =
      delayMs ?? (Date.now() < this.fastPollUntil ? FAST_POLL_MS : IDLE_POLL_MS);
    this.pollTimer = window.setTimeout(() => {
      this.pollTimer = null;
      if (isReconnect) {
        void this.connect();
      } else {
        void this.poll();
      }
    }, interval);
  }

  private async poll(): Promise<void> {
    if (this.disposed || !this.peerId || !this.peerToken || this.pollingInFlight) return;
    this.pollingInFlight = true;
    try {
      const res = await fetch(`${this.baseUrl}/api/signal/poll`, {
        method: 'GET',
        headers: {
          'X-Peer-Id': this.peerId,
          'X-Peer-Token': this.peerToken,
        },
        cache: 'no-store',
      });

      if (res.status === 401) {
        this.isConnected = false;
        this.dispatch('disconnect');
        this.pollingInFlight = false;
        void this.connect();
        return;
      }

      if (res.ok) {
        const data = (await res.json()) as { success: boolean; events?: QueuedEvent[] };
        if (data.success) {
          if (!this.isConnected) {
            this.isConnected = true;
            this.dispatch('connect');
          }
          this.dispatchBatch(data.events);
        }
      }
    } catch {
      if (this.isConnected) {
        this.isConnected = false;
        this.dispatch('disconnect');
      }
    } finally {
      this.pollingInFlight = false;
      if (!this.disposed) {
        this.scheduleNextPoll();
      }
    }
  }

  public emit(event: string, payload?: unknown): void {
    if (this.disposed || !this.peerId || !this.peerToken) return;
    if (ACTIVE_SIGNAL_EVENTS.has(event)) {
      this.fastPollUntil = Date.now() + FAST_POLL_BOOST_MS;
    }

    void fetch(`${this.baseUrl}/api/signal/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Peer-Id': this.peerId,
        'X-Peer-Token': this.peerToken,
      },
      body: JSON.stringify({ event, payload: payload ?? {} }),
    })
      .then(async (res) => {
        if (this.disposed) return;
        if (res.status === 401) {
          this.isConnected = false;
          this.dispatch('disconnect');
          void this.connect();
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { success: boolean; events?: QueuedEvent[] };
        if (data.success) {
          this.dispatchBatch(data.events);
        }
      })
      .catch(() => {
        // Network blips will be recovered by next poll cycle
      });
  }

  private sendDisconnectBeacon(): void {
    if (!this.peerId || !this.peerToken) return;
    const body = JSON.stringify({ peerId: this.peerId, peerToken: this.peerToken });
    try {
      void fetch(`${this.baseUrl}/api/signal/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Peer-Id': this.peerId,
          'X-Peer-Token': this.peerToken,
        },
        body,
        keepalive: true,
      });
    } catch {
      // Ignore teardown errors
    }
  }

  public disconnect(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHideBound);
    }
    this.sendDisconnectBeacon();
    this.isConnected = false;
    this.peerToken = null;
    this.listeners.clear();
  }
}

/**
 * Dual-transport facade that seamlessly uses Socket.IO on persistent Node/Docker servers
 * and automatically switches to authenticated Serverless HTTP Signaling on Vercel.
 */
class AdaptiveSignalingClient implements SignalingTransport {
  private activeMode: 'socketio' | 'serverless' = 'socketio';
  private socketClient: Socket | null = null;
  private httpClient: HttpSignalingClient | null = null;
  private listeners = new Map<string, Set<SignalHandler>>();
  private disposed = false;

  constructor() {
    void this.bootstrap();
  }

  public get id(): string | undefined {
    return this.socketClient?.id ?? this.httpClient?.id;
  }

  public get connected(): boolean {
    return Boolean(this.socketClient?.connected || this.httpClient?.connected);
  }

  public get mode(): 'socketio' | 'serverless' {
    return this.activeMode;
  }

  public on(event: string, handler: SignalHandler): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    if (this.socketClient) {
      this.socketClient.on(event, handler);
    } else if (this.httpClient) {
      this.httpClient.on(event, handler);
    }
  }

  public off(event: string, handler: SignalHandler): void {
    this.listeners.get(event)?.delete(handler);
    this.socketClient?.off(event, handler);
    this.httpClient?.off(event, handler);
  }

  public emit(event: string, payload?: unknown): void {
    if (this.socketClient) {
      if (payload === undefined) {
        this.socketClient.emit(event);
      } else {
        this.socketClient.emit(event, payload);
      }
    } else if (this.httpClient) {
      this.httpClient.emit(event, payload);
    }
  }

  public disconnect(): void {
    this.disposed = true;
    this.socketClient?.disconnect();
    this.socketClient = null;
    this.httpClient?.disconnect();
    this.httpClient = null;
    this.listeners.clear();
  }

  private attachAllListeners(target: { on(e: string, h: SignalHandler): void }): void {
    for (const [event, handlers] of this.listeners.entries()) {
      for (const handler of handlers) {
        target.on(event, handler);
      }
    }
  }

  private startHttpTransport(): void {
    if (this.disposed || this.httpClient) return;
    if (this.socketClient) {
      this.socketClient.removeAllListeners();
      this.socketClient.disconnect();
      this.socketClient = null;
    }
    this.activeMode = 'serverless';
    const client = new HttpSignalingClient('');
    this.httpClient = client;
    this.attachAllListeners(client);
  }

  private startSocketTransport(externalUrl?: string): void {
    if (this.disposed || this.socketClient) return;
    this.activeMode = 'socketio';
    const socket = externalUrl
      ? io(externalUrl, { transports: ['websocket', 'polling'] })
      : io({ transports: ['websocket', 'polling'] });
    this.socketClient = socket;
    this.attachAllListeners(socket);

    // If same-origin Socket.IO fails to connect (e.g., serverless host), seamlessly fall back to HTTP signaling
    if (!externalUrl) {
      let everConnected = false;
      const fallbackTimer = window.setTimeout(() => {
        if (!everConnected && !this.disposed && !socket.connected) {
          this.startHttpTransport();
        }
      }, 3800);

      socket.on('connect', () => {
        everConnected = true;
        window.clearTimeout(fallbackTimer);
      });
    }
  }

  private async bootstrap(): Promise<void> {
    const externalSignalingUrl = (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.trim();
    const forceHttp =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('transport') === 'http';

    if (forceHttp) {
      this.startHttpTransport();
      return;
    }

    if (externalSignalingUrl) {
      this.startSocketTransport(externalSignalingUrl);
      return;
    }

    // Probe /api/health to detect whether backend is persistent Socket.IO or Vercel Serverless
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (this.disposed) return;
      if (res.ok) {
        const data = (await res.json()) as { mode?: string };
        if (data.mode === 'serverless') {
          this.startHttpTransport();
          return;
        }
      }
    } catch {
      // Fall through to Socket.IO with automatic HTTP fallback
    }

    if (!this.disposed) {
      this.startSocketTransport();
    }
  }
}

export function createSignalingClient(): SignalingTransport {
  return new AdaptiveSignalingClient();
}
