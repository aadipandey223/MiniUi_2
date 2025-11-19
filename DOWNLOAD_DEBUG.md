# 🐛 Download Not Working - Debug Guide

## What to Check

### 1. Open Browser Console (F12)

When you click "Download", you should see these logs:

```
✅ Expected Flow:
🔽 downloadFileWithPriority called: filename.txt priority: 0
   File info: {id: "...", name: "...", size: ..., peerId: "..."}
   Semaphore status: {current: 0, max: 3, canAcquire: true}
   Added to queue with ID: ...
   Processing queue...
processNextInQueue called {canAcquire: true, currentCount: 0, ...}
Starting next download: filename.txt
Starting download from queue: filename.txt
📡 Data channel opened, requesting file: filename.txt
   FileInfo: {...}
   Sending request: {type: "request", fileId: "...", fileName: "..."}
```

### 2. Common Issues

#### Issue A: No logs appear
**Problem**: JavaScript not loaded or error before download
**Check**: 
- Console shows any red errors?
- Socket connected? Look for "✅ Socket.io initialized"

#### Issue B: "File info: undefined"
**Problem**: File object not passed correctly
**Check**:
- Are files showing in "Available Files"?
- Click download and check what fileInfo contains

#### Issue C: "Semaphore status: {canAcquire: false}"
**Problem**: Too many concurrent downloads
**Solution**: Wait for current downloads to finish or increase limit

#### Issue D: Data channel never opens
**Problem**: WebRTC connection failed
**Check**:
- Both users connected to server?
- STUN servers accessible?
- Firewall blocking WebRTC?

#### Issue E: "Sending request" but no response
**Problem**: Peer not responding
**Check**:
- Is the file sharer still connected?
- Check their console for errors

### 3. Test Locally

```bash
# Terminal 1
npm start

# Browser 1 (Person A)
1. Open http://localhost:3000
2. Upload a file
3. Open console (F12)

# Browser 2 (Person B) - Incognito window
1. Open http://localhost:3000
2. See file in "Available Files"
3. Open console (F12)
4. Click "Download"
5. Watch console logs
```

### 4. Check Socket Connection

In console, type:
```javascript
socket.connected
```

Should return: `true`

If `false`, the socket isn't connected.

### 5. Check Available Files

In console, type:
```javascript
availableFiles
```

Should show array of files. If empty, no files are shared.

### 6. Manual Test

In console, try:
```javascript
// Get first available file
const file = availableFiles[0];
console.log('File:', file);

// Try to download it
window.downloadFileWithPriority(file, 0);
```

Watch the logs to see where it fails.

### 7. Check Peer Connection

In console:
```javascript
peerConnections
```

Should show Map of peer connections. If empty, no connections established.

## Quick Fixes

### Fix 1: Refresh Both Browsers
Sometimes WebRTC connections get stuck. Refresh both users.

### Fix 2: Check Network Tab
1. F12 → Network tab
2. Filter: WS (WebSocket)
3. Should see `socket.io` connection
4. Status should be "101 Switching Protocols"

### Fix 3: Test with Small File
Try downloading a very small file (< 1MB) first to rule out size issues.

### Fix 4: Check HTTPS
WebRTC works better with HTTPS. On Railway, this is automatic.

## What I Added

Enhanced logging in `downloadFileWithPriority`:
- Shows file info
- Shows semaphore status
- Shows queue ID
- Shows processing status

This will help identify exactly where the download fails.

## Next Steps

1. Click download
2. Copy all console logs
3. Share them so I can see where it's failing

The logs will show:
- ✅ If the function is called
- ✅ If the file info is correct
- ✅ If semaphore allows download
- ✅ If queue processing starts
- ✅ If WebRTC connection opens
- ✅ If file request is sent

---

**Test it now and share the console logs!** 🔍
