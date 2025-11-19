# Private Mode Download Fix

## Issue
Downloads were not working in private mode (room mode) but worked fine in global mode.

## Root Cause
There was a mismatch between the sender and receiver logic for encrypted file transfers:

**Sender (Room Mode):**
- Sent encrypted chunks as JSON with format: `{data, roomIv, encrypted, chunkIndex}`
- Used room encryption only (not triple-layer)

**Receiver:**
- Expected encrypted chunks with format: `{data, signature}` for triple-layer encryption
- The condition `parsed.data && parsed.signature` never matched room-encrypted chunks
- Room-encrypted chunks fell through to the unencrypted handler, causing failures

## Solution
Updated the receiver logic in `public/app.js` to properly handle room-encrypted chunks:

1. Changed the condition from `parsed.data && parsed.signature` to `parsed.data && parsed.roomIv`
2. Simplified the decryption to only use room decryption (matching the sender)
3. Removed the unused triple-layer decryption code (signature verification, session decryption)

## Changes Made
- **File:** `public/app.js`
- **Lines:** ~1677-1695
- **Change:** Updated encrypted chunk detection and decryption logic to match room encryption format

## Result
Private mode downloads now work the same as global mode downloads, with proper room encryption/decryption.
