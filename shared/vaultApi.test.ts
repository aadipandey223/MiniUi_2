import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import vercelApp from '../api/index.ts';

async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const server = http.createServer(vercelApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function hmacHex(verifierHex: string, nonce: string): string {
  return crypto
    .createHmac('sha256', Buffer.from(verifierHex, 'hex'))
    .update(nonce)
    .digest('hex');
}

test('Vercel /api/index.ts exposes serverless health, security headers, and blocks untrusted origins', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.match(res.headers.get('cache-control') || '', /no-store/i);

    const body = (await res.json()) as { ok: boolean; mode: string; persistence: string };
    assert.equal(body.ok, true);
    assert.equal(body.mode, 'serverless');
    assert.equal(body.persistence, 'memory');

    // Untrusted cross-origin should not receive Access-Control-Allow-Origin
    const corsRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://attacker.example' },
    });
    assert.equal(corsRes.headers.get('access-control-allow-origin'), null);
  });
});

test('Vercel Serverless HTTP Signaling enforces X-Peer-Token, HMAC auth, room isolation, and peer relay', async () => {
  await withServer(async (baseUrl) => {
    // 1. Connect Peer 1 & Peer 2
    const c1 = (await (await fetch(`${baseUrl}/api/signal/connect`, { method: 'POST' })).json()) as {
      success: boolean;
      peerId: string;
      peerToken: string;
    };
    const c2 = (await (await fetch(`${baseUrl}/api/signal/connect`, { method: 'POST' })).json()) as {
      success: boolean;
      peerId: string;
      peerToken: string;
    };
    assert.equal(c1.success, true);
    assert.equal(c2.success, true);
    assert.equal(c1.peerToken.length, 64);

    // 2. Forged/missing token must be rejected with 401
    const badPoll = await fetch(`${baseUrl}/api/signal/poll`, {
      headers: { 'X-Peer-Id': c1.peerId, 'X-Peer-Token': '0'.repeat(64) },
    });
    assert.equal(badPoll.status, 401);

    const badEmit = await fetch(`${baseUrl}/api/signal/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Peer-Id': c1.peerId },
      body: JSON.stringify({ event: 'room:leave', payload: {} }),
    });
    assert.equal(badEmit.status, 401);

    const emitAs = async (peer: { peerId: string; peerToken: string }, event: string, payload: unknown) => {
      const r = await fetch(`${baseUrl}/api/signal/emit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Peer-Id': peer.peerId,
          'X-Peer-Token': peer.peerToken,
        },
        body: JSON.stringify({ event, payload }),
      });
      assert.equal(r.status, 200);
      return (await r.json()) as { success: boolean; events: Array<{ event: string; payload: any }> };
    };

    const pollAs = async (peer: { peerId: string; peerToken: string }) => {
      const r = await fetch(`${baseUrl}/api/signal/poll`, {
        headers: {
          'X-Peer-Id': peer.peerId,
          'X-Peer-Token': peer.peerToken,
        },
      });
      assert.equal(r.status, 200);
      return (await r.json()) as { success: boolean; events: Array<{ event: string; payload: any }> };
    };

    // 3. Create password-protected Private Room
    const reserve = (await (await fetch(`${baseUrl}/api/rooms/reserve-id`)).json()) as {
      success: boolean;
      roomId: string;
    };
    assert.equal(reserve.success, true);
    const verifierHex = crypto.randomBytes(32).toString('hex');

    const createdRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: reserve.roomId,
        name: 'Aurum Vercel Test',
        passwordVerifier: verifierHex,
        expiresInMs: 3600_000,
      }),
    });
    assert.equal(createdRes.status, 201);
    const created = (await createdRes.json()) as { success: boolean; room: { id: string; requiresPassword: boolean } };
    assert.equal(created.room.id, reserve.roomId);
    assert.equal(created.room.requiresPassword, true);

    // 4. Peer 1 fails with wrong HMAC proof, then joins with valid HMAC proof
    const ch1 = await emitAs(c1, 'room:join-request', { roomId: reserve.roomId });
    assert.equal(ch1.events[0]?.event, 'room:challenge');
    const wrong = await emitAs(c1, 'room:auth-proof', { roomId: reserve.roomId, proof: 'f'.repeat(64) });
    assert.equal(wrong.events[0]?.event, 'room:error');
    assert.match(wrong.events[0]?.payload?.error || '', /Incorrect room password/i);

    const ch1Retry = await emitAs(c1, 'room:join-request', { roomId: reserve.roomId });
    const nonce1 = ch1Retry.events[0].payload.nonce as string;
    const joined1 = await emitAs(c1, 'room:auth-proof', {
      roomId: reserve.roomId,
      proof: hmacHex(verifierHex, nonce1),
    });
    assert.equal(joined1.events[0]?.event, 'room:joined');
    assert.equal(joined1.events[0]?.payload?.room?.id, reserve.roomId);

    // 5. Cross-room isolation: Peer 2 (still in Open Lobby) cannot signal Peer 1 (inside Private Room)
    await emitAs(c2, 'webrtc:offer', {
      targetPeerId: c1.peerId,
      transferId: 'tx-cross-room',
      offer: { type: 'offer', sdp: 'v=0' },
    });
    const p1CrossPoll = await pollAs(c1);
    assert.equal(
      p1CrossPoll.events.some((e) => e.event === 'webrtc:offer'),
      false,
      'Cross-room signaling must be blocked'
    );

    // 6. Peer 2 joins same Private Room, shares a file, and receives WebRTC + encrypted relay packets from Peer 1
    const ch2 = await emitAs(c2, 'room:join-request', { roomId: reserve.roomId });
    const nonce2 = ch2.events[0].payload.nonce as string;
    const joined2 = await emitAs(c2, 'room:auth-proof', {
      roomId: reserve.roomId,
      proof: hmacHex(verifierHex, nonce2),
    });
    assert.equal(joined2.events[0]?.event, 'room:joined');

    const shareRes = await emitAs(c2, 'file:share', {
      clientTempId: 'tmp-1',
      name: 'mineral-ledger.pdf',
      size: 2048,
      mimeType: 'application/pdf',
      expiresInMs: 600_000,
    });
    assert.equal(shareRes.events[0]?.event, 'file:confirmed');

    // Peer 1 sees Peer 2's file on poll
    const p1Poll = await pollAs(c1);
    const roomState = p1Poll.events.find((e) => e.event === 'room:state');
    assert.ok(roomState);
    assert.equal(roomState.payload.files.length, 1);
    assert.equal(roomState.payload.files[0].name, 'mineral-ledger.pdf');

    // Peer 1 sends WebRTC offer & encrypted relay packet to Peer 2
    await emitAs(c1, 'webrtc:offer', {
      targetPeerId: c2.peerId,
      transferId: 'tx-room-1',
      offer: { type: 'offer', sdp: 'v=0' },
    });
    await emitAs(c1, 'relay:packet', {
      targetPeerId: c2.peerId,
      transferId: 'tx-room-1',
      packet: { type: 'chunk', ciphertext: 'opaque' },
    });

    const p2Poll = await pollAs(c2);
    const offerEvt = p2Poll.events.find((e) => e.event === 'webrtc:offer');
    const relayEvt = p2Poll.events.find((e) => e.event === 'relay:packet');
    assert.ok(offerEvt);
    assert.equal(offerEvt.payload.fromPeerId, c1.peerId);
    assert.ok(relayEvt);
    assert.equal(relayEvt.payload.fromPeerId, c1.peerId);

    // 7. Disconnect Peer 2 -> removes Peer 2 & its shared file from room
    await fetch(`${baseUrl}/api/signal/disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Peer-Id': c2.peerId,
        'X-Peer-Token': c2.peerToken,
      },
      body: JSON.stringify({}),
    });
    const p1AfterDisconnect = await pollAs(c1);
    const finalRoomState = p1AfterDisconnect.events.find((e) => e.event === 'room:state');
    assert.equal(finalRoomState?.payload.peers.length, 1);
    assert.equal(finalRoomState?.payload.files.length, 0);

    // Cleanup Peer 1
    await fetch(`${baseUrl}/api/signal/disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Peer-Id': c1.peerId,
        'X-Peer-Token': c1.peerToken,
      },
      body: JSON.stringify({}),
    });
  });
});
