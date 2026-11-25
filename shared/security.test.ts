import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthLockoutTracker,
  SlidingWindowRateLimiter,
  extractRoomIdFromInput,
  isSameOriginRequest,
  isValidRoomId,
  sanitizeDownloadFilename,
  sanitizeHostHeader,
} from './security.ts';

describe('Room ID & share link parsing', () => {
  it('extracts room codes from raw codes, formatted codes, and full share URLs', () => {
    assert.equal(extractRoomIdFromInput('k9m4px2qr'), 'K9M4PX2QR');
    assert.equal(extractRoomIdFromInput('  K9M-4PX-2QR  '), 'K9M4PX2QR');
    assert.equal(extractRoomIdFromInput('http://localhost:3000/room/K9M4PX2QR'), 'K9M4PX2QR');
    assert.equal(extractRoomIdFromInput('https://vaultbeam.app/room/ab12cd34e?ref=qr'), 'AB12CD34E');
    assert.equal(isValidRoomId('K9M4PX2QR'), true);
    assert.equal(isValidRoomId('../etc'), false);
    assert.equal(isValidRoomId('abc'), false);
  });
});

describe('Download filename & host sanitization', () => {
  it('neutralizes path traversal, control characters, and reserved prefixes', () => {
    assert.equal(sanitizeDownloadFilename('../../etc/passwd'), 'passwd');
    assert.equal(sanitizeDownloadFilename('C:\\Users\\evil\\..\\payload.txt'), 'payload.txt');
    assert.equal(sanitizeDownloadFilename('...hidden.pdf'), 'hidden.pdf');
    assert.equal(sanitizeDownloadFilename('report\u0000\n<bad>.csv'), 'report_bad_.csv');
    assert.equal(sanitizeDownloadFilename('...'), 'vaultbeam-file');
  });

  it('rejects injected Host headers and allows valid host:port values', () => {
    assert.equal(sanitizeHostHeader('vaultbeam.example.com:3000'), 'vaultbeam.example.com:3000');
    assert.equal(sanitizeHostHeader('evil.com/path@victim.com', 'localhost:3000'), 'localhost:3000');
    assert.equal(sanitizeHostHeader('evil.com\r\nX-Injected: 1', 'localhost:3000'), 'localhost:3000');
  });

  it('validates same-origin requests and blocks untrusted cross-site origins', () => {
    assert.equal(isSameOriginRequest(undefined, 'example.com'), true);
    assert.equal(isSameOriginRequest('https://vault.example.com', 'vault.example.com'), true);
    assert.equal(isSameOriginRequest('http://localhost:3000', 'localhost:3000'), true);
    assert.equal(isSameOriginRequest('https://attacker.evil.com', 'vault.example.com'), false);
    assert.equal(isSameOriginRequest('javascript:alert(1)', 'vault.example.com'), false);
  });
});

describe('SlidingWindowRateLimiter & AuthLockoutTracker', () => {
  it('enforces sliding-window request quotas and resets after the window passes', () => {
    const limiter = new SlidingWindowRateLimiter(3, 10_000);
    const t0 = 1_000_000;
    assert.equal(limiter.consume('ip-1', t0).allowed, true);
    assert.equal(limiter.consume('ip-1', t0 + 100).allowed, true);
    assert.equal(limiter.consume('ip-1', t0 + 200).allowed, true);

    const blocked = limiter.consume('ip-1', t0 + 300);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSec >= 9);

    // Different IP is unaffected
    assert.equal(limiter.consume('ip-2', t0 + 300).allowed, true);

    // Window expires
    assert.equal(limiter.consume('ip-1', t0 + 10_500).allowed, true);
  });

  it('locks out after 5 consecutive password failures and resets on success', () => {
    const tracker = new AuthLockoutTracker(5, 15 * 60 * 1000, 15 * 60 * 1000);
    const key = '1.2.3.4:ROOM12345';
    const t0 = 2_000_000;

    for (let i = 1; i <= 4; i++) {
      const res = tracker.recordFailure(key, t0 + i * 1000);
      assert.equal(res.locked, false);
      assert.equal(res.attemptsRemaining, 5 - i);
    }

    const fifth = tracker.recordFailure(key, t0 + 5000);
    assert.equal(fifth.locked, true);
    assert.equal(tracker.check(key, t0 + 6000).locked, true);

    // Unlock after lockout period
    assert.equal(tracker.check(key, t0 + 16 * 60 * 1000).locked, false);

    // Success clears failure history
    tracker.recordFailure(key, t0 + 17 * 60 * 1000);
    tracker.recordSuccess(key);
    assert.equal(tracker.check(key, t0 + 17 * 60 * 1000 + 100).locked, false);
  });
});
