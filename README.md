# VaultBeam — Zero-Knowledge P2P Encrypted File Transfer

**VaultBeam** is a hardened peer-to-peer encrypted file transfer web application built with **React, TypeScript, Tailwind CSS, Express, Socket.IO, WebRTC, and the native Web Crypto API**. Files stay in browser memory, stream directly between devices (with an automatic end-to-end encrypted relay fallback), and are cryptographically verified chunk-by-chunk before saving.

---

## Visual Design & Workspace Modes

### Open Lobby — Subtle Monochrome B&W
- **Light (Gallery Paper)** and **Dark (Matte Charcoal)** monochrome palettes with hairline borders and zero visual noise, plus an unlockable **Graphite Cipher** theme.
- **Simple / Advanced Mode Toggle**:
  - **Simple Mode** (default) keeps the workspace uncluttered for everyday transfers—just drop files, share a code/link, and receive.
  - **Advanced Mode** reveals the interactive transfer queue scheduler (`FCFS` / `SJF` / `Priority`), semaphore concurrency slots (`1–6`), live throughput graph, visual ECDSA key art, and quick `⌘K` command palette.

### Private Rooms — Mineral & Ore Chemistry Vault Themes
Entering or creating a **Private Room** automatically shifts the workspace from neutral monochrome into a dedicated **Mineral / Ore Chemistry** vault theme (harmonized for both Light & Dark modes) so you always know at a glance that you are inside an isolated vault:

| Mineral Finish | Symbol | Palette Inspiration |
| :--- | :--- | :--- |
| **Aurum** *(default)* | `Au · 79` | Brushed Gold, Warm Limestone & Volcanic Basalt |
| **Cuprum** | `Cu · 29` | Native Copper, Rose Quartz & Cuprite Slate |
| **Malachite** | `Cu₂CO₃` | Mineral Jade, Dolomite & Serpentine Stone |
| **Pyrite** | `FeS₂` | Smoked Brass, Linen & Matte Gunmetal |

Switch mineral finishes inline from the Private Room session bar or via `⌘K`. Leaving the room returns the interface to monochrome B&W.

---

## Hardened Security Architecture

### 1. Triple-Layer Client-Side Web Crypto
- **Layer 1 — Ephemeral Session Encryption + AAD Binding**: Every file transfer generates a fresh 256-bit **AES-256-GCM** session key. Each 48 KB chunk uses a CSPRNG 96-bit nonce and Associated Authenticated Data (`AAD`) binding `(transferId, fileId, chunkIndex)`—preventing chunk reordering, index spoofing, or cross-transfer splicing.
- **Layer 2 — Hardened Channel Key Wrapping**:
  - **Private Rooms** derive a domain-separated AES-256-GCM room key locally using **PBKDF2-SHA256 (310,000 iterations)** and wrap the session key with AAD binding. Downgrade protection rejects any non-room key wrap inside a private room.
  - **Open Lobby** transfers derive a pairwise wrapping key via ephemeral **ECDH P-256**.
- **Layer 3 — Pinned Sender Identity & Integrity Chain**:
  - Each browser session generates non-extractable **ECDSA P-256** and **ECDH P-256** key pairs (private keys never leave Web Crypto memory).
  - Receivers pin the sender’s public keys against the room/lobby peer registry (blocking key substitution), enforce strict chunk index bounds and exact byte counts, verify a sequential **SHA-256 hash chain** over every chunk, validate the **ECDSA P-256 signature**, and sanitize filenames before saving.

### 2. Zero-Knowledge Room Authentication & Server Hardening
- **Zero-Knowledge Challenge-Response**: Room passwords never leave your browser. The client derives a domain-separated PBKDF2-SHA256 (310,000 rounds) verifier; joiners prove knowledge via single-use **HMAC-SHA256** nonces verified in constant time (`crypto.timingSafeEqual`).
- **Brute-Force Lockout & Rate Limiting**: Sliding-window rate limiters protect room creation, room-code lookups, joins, and file sharing; repeated failed password attempts trigger automatic temporary room lockout.
- **Same-Origin Isolation & Security Headers**: Express and Socket.IO enforce same-origin checks, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, strict `Permissions-Policy`, `Cache-Control: no-store` on API routes, host-header validation, and strict room-scoped signaling boundaries.
- **Live Verification Check**: Run the built-in loopback test on the **Security** tab to verify live encryption, key wrapping, SHA-256 chaining, ECDSA signatures, and **active tamper rejection** (corrupted ciphertext + mismatched AAD index).

---

## Sharing Links, Codes & QR Invites

1. Click **New Room** to create an isolated room with optional password, CSPRNG password generator, and lifespan (`30m`, `2h`, `24h`, or until everyone leaves).
2. You enter the room automatically in the **Aurum (`Au · 79`)** vault theme with a ready-to-share **9-character Room Code**, **Direct Share Link** (`/room/<CODE>`), and scannable **QR Code**.
3. Invitees can:
   - Open the **Direct Share Link** directly in their browser (auto-joins passwordless rooms, or opens the password prompt pre-filled with the room name and code), **or**
   - Click **Join Code** and enter either the 9-character code **or** paste the full share link.

---

## Shortcuts & Hidden Discoveries

Press **`⌘K`** (or **`Ctrl+K`**) anywhere to open the command palette:
- `/zen` — Distraction-free Focus Drop Mode
- `/entropy` — Live Web Crypto CSPRNG byte & Shannon entropy inspector
- `/matrix` — Subtle monochrome glyph backdrop
- `/cipher` — Unlock the hidden Graphite Cipher theme (also unlocked via Konami code or tapping the VaultBeam emblem 5 times)
- `/trivia` — Cryptography history notes

---

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in two browser tabs or devices to test live encrypted P2P transfers, or visit the **Security** tab to run the cryptographic verification check.

## Testing & Production Build

```bash
# Run unit tests (security, Vercel serverless API, Web Crypto AAD/tamper tests, formatting, themes)
npx tsx --test shared/security.test.ts shared/vaultApi.test.ts src/lib/crypto.test.ts src/lib/experience.test.ts src/lib/format.test.ts

# Typecheck & production bundle
npm run lint
npm run build
NODE_ENV=production npm start
```

---

## Deploying to Vercel

VaultBeam is preconfigured for **Vercel** out of the box (`vercel.json` + `/api/index.ts`):

1. **Import & Deploy**: Connect this repository in Vercel (or run `vercel --prod`). Vercel automatically runs `npm run build` (Vite SPA -> `dist/`), deploys `/api/index.ts` as a zero-Vite Serverless Function, and rewrites `/room/:roomId` deep links to `/index.html`.
2. **Automatic Serverless HTTP Signaling**: Because Vercel Serverless Functions do not hold persistent WebSockets, the client probes `/api/health` on startup and automatically switches from Socket.IO to authenticated Serverless HTTP Signaling (`/api/signal/*` with 256-bit `X-Peer-Token` verification) while keeping full WebRTC P2P + E2E-encrypted relay fallback and triple-layer Web Crypto intact.
3. **Optional Scaling Environment Variables** (see `.env.example`):
   - **Upstash Redis / Vercel KV** (`KV_REST_API_URL` + `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`): Automatically activates multi-instance room & signaling mailbox sync across serverless invocations.
   - **External WebSocket Server** (`VITE_SIGNALING_URL`): Optional URL to a persistent Node/Docker `server.ts` instance if you prefer direct Socket.IO over Serverless HTTP polling.

## License

MIT
