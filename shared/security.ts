/**
 * VaultBeam Shared Security & Validation Primitives
 * Pure, dependency-free security helpers used across server and client.
 */

const ROOM_ID_PATTERN = /^[A-Z0-9]{6,16}$/;
const VALID_HOST_PATTERN = /^[a-zA-Z0-9.-]+(?::\d{1,5})?$/;

export function isValidRoomId(value: unknown): value is string {
  return typeof value === 'string' && ROOM_ID_PATTERN.test(value.toUpperCase());
}

/**
 * Extracts a clean uppercase room code from either a raw room code
 * ("K9M4PX2QR") or a full VaultBeam share link ("https://host/room/K9M4PX2QR").
 */
export function extractRoomIdFromInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Try matching /room/<CODE> inside a URL or path
  const pathMatch = trimmed.match(/\/room\/([A-Za-z0-9]{6,16})(?:[/?#]|$)/i);
  if (pathMatch) {
    return pathMatch[1].toUpperCase();
  }

  // Strip spaces or hyphens if user typed a formatted code
  const compact = trimmed.replace(/[\s-]+/g, '').toUpperCase();
  if (ROOM_ID_PATTERN.test(compact)) {
    return compact;
  }

  return trimmed.toUpperCase();
}

/**
 * Sanitizes an untrusted filename before triggering a browser download.
 * Prevents path traversal, control-character injection, and reserved OS names.
 */
export function sanitizeDownloadFilename(rawName: unknown): string {
  if (typeof rawName !== 'string') return 'vaultbeam-file';

  // Take only the basename after any slash or backslash
  const base = rawName.split(/[\\/]/).pop() ?? '';

  // Remove ASCII control characters, null bytes, and filesystem-unsafe characters
  const cleaned = base
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim();

  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return 'vaultbeam-file';
  }

  return cleaned.slice(0, 200);
}

/**
 * Validates an HTTP Host / X-Forwarded-Host header to prevent host-header injection
 * when constructing share links server-side.
 */
export function sanitizeHostHeader(rawHost: unknown, fallback = 'localhost:3000'): string {
  if (typeof rawHost !== 'string') return fallback;
  const first = rawHost.split(',')[0]?.trim() ?? '';
  if (!first || first.length > 253 || !VALID_HOST_PATTERN.test(first)) {
    return fallback;
  }
  return first;
}

/**
 * Verifies that an incoming HTTP Origin header matches the server host
 * (or localhost dev hosts), rejecting untrusted third-party cross-origin sites.
 */
export function isSameOriginRequest(origin: string | undefined, hostHeader: string | undefined): boolean {
  // Non-browser or same-origin requests omit the Origin header
  if (!origin) return true;

  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
      return false;
    }

    if (hostHeader) {
      const normalizedHost = sanitizeHostHeader(hostHeader, '').toLowerCase();
      if (normalizedHost && parsedOrigin.host.toLowerCase() === normalizedHost) {
        return true;
      }
      // Match hostname when reverse proxy strips default ports
      const hostWithoutPort = normalizedHost.split(':')[0];
      if (hostWithoutPort && parsedOrigin.hostname.toLowerCase() === hostWithoutPort) {
        return true;
      }
    }

    // Allow local loopback dev origins
    const hostname = parsedOrigin.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * In-memory sliding-window rate limiter keyed by client IP or socket ID.
 */
export class SlidingWindowRateLimiter {
  private buckets = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  public consume(key: string, now = Date.now()): RateLimitResult {
    const cutoff = now - this.windowMs;
    const timestamps = this.buckets.get(key) ?? [];
    const active = timestamps.filter((t) => t > cutoff);

    if (active.length >= this.maxRequests) {
      const oldest = active[0] ?? now;
      const retryAfterMs = Math.max(1000, oldest + this.windowMs - now);
      this.buckets.set(key, active);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.ceil(retryAfterMs / 1000),
      };
    }

    active.push(now);
    this.buckets.set(key, active);
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - active.length),
      retryAfterSec: 0,
    };
  }

  public prune(now = Date.now()): void {
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.buckets.entries()) {
      const active = timestamps.filter((t) => t > cutoff);
      if (active.length === 0) {
        this.buckets.delete(key);
      } else {
        this.buckets.set(key, active);
      }
    }
  }
}

interface LockoutRecord {
  failures: number[];
  lockedUntil: number;
}

/**
 * Brute-force lockout tracker for room password challenge-response authentication.
 */
export class AuthLockoutTracker {
  private records = new Map<string, LockoutRecord>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly lockoutMs: number;

  constructor(maxFailures = 5, windowMs = 15 * 60 * 1000, lockoutMs = 15 * 60 * 1000) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.lockoutMs = lockoutMs;
  }

  public check(key: string, now = Date.now()): { locked: boolean; retryAfterSec: number } {
    const rec = this.records.get(key);
    if (!rec) return { locked: false, retryAfterSec: 0 };
    if (rec.lockedUntil > now) {
      return {
        locked: true,
        retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000),
      };
    }
    return { locked: false, retryAfterSec: 0 };
  }

  public recordFailure(key: string, now = Date.now()): {
    locked: boolean;
    attemptsRemaining: number;
    retryAfterSec: number;
  } {
    const cutoff = now - this.windowMs;
    const prev = this.records.get(key) ?? { failures: [], lockedUntil: 0 };
    const recent = prev.failures.filter((t) => t > cutoff);
    recent.push(now);

    if (recent.length >= this.maxFailures) {
      const lockedUntil = now + this.lockoutMs;
      this.records.set(key, { failures: recent, lockedUntil });
      return {
        locked: true,
        attemptsRemaining: 0,
        retryAfterSec: Math.ceil(this.lockoutMs / 1000),
      };
    }

    this.records.set(key, { failures: recent, lockedUntil: 0 });
    return {
      locked: false,
      attemptsRemaining: Math.max(0, this.maxFailures - recent.length),
      retryAfterSec: 0,
    };
  }

  public recordSuccess(key: string): void {
    this.records.delete(key);
  }

  public prune(now = Date.now()): void {
    const cutoff = now - this.windowMs;
    for (const [key, rec] of this.records.entries()) {
      const recent = rec.failures.filter((t) => t > cutoff);
      if (recent.length === 0 && rec.lockedUntil <= now) {
        this.records.delete(key);
      } else {
        this.records.set(key, { failures: recent, lockedUntil: rec.lockedUntil });
      }
    }
  }
}
