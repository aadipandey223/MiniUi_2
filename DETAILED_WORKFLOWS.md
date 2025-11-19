# Detailed Workflow Diagrams

## 🔄 Complete User Journey Workflows

### Workflow 1: First-Time User Experience

```
START
  │
  ├─► Open Browser
  │
  ├─► Load Application (index.html)
  │
  ├─► Initialize Identity
  │   ├─► Check localStorage for existing identity
  │   ├─► If not found:
  │   │   ├─► Generate RSA-2048 keypair
  │   │   ├─► Create identity hash
  │   │   ├─► Save to localStorage
  │   │   └─► Display: "Anonymous#[hash]"
  │   └─► If found: Load existing identity
  │
  ├─► Connect to Server (Socket.IO)
  │   ├─► Establish WebSocket connection
  │   ├─► Receive unique peer ID
  │   └─► Update UI: "Connected"
  │
  ├─► Check URL for Room ID
  │   ├─► If room ID present: → Go to "Join Room Flow"
  │   └─► If no room ID: → Stay in Global Mode
  │
  └─► READY (Global Mode)
      ├─► Can share files globally
      ├─► Can see all global files
      └─► Can create/join rooms
```


### Workflow 2: Creating a Private Room

```
User clicks "Create Room"
  │
  ├─► Show Modal
  │   ├─► Password field (optional)
  │   ├─► Password strength indicator
  │   ├─► Generate password button
  │   └─► Expiration dropdown
  │
  ├─► User enters password (or leaves empty)
  │
  ├─► User clicks "Create Room"
  │
  ├─► Client sends POST /api/rooms/create
  │   └─► Body: { password, expiresIn }
  │
  ├─► Server processes request
  │   ├─► Generate random 9-char room ID
  │   ├─► Hash password with Argon2 (if provided)
  │   ├─► Create room object
  │   │   └─► { id, passwordHash, createdAt, expiresAt, peers: Set(), files: Map() }
  │   ├─► Store in rooms Map
  │   └─► Return { success: true, roomId, shareLink }
  │
  ├─► Client receives response
  │
  ├─► Show Room Link Modal
  │   ├─► Display room ID (clickable to copy)
  │   ├─► Display full share link
  │   ├─► Generate QR code
  │   ├─► Copy link button
  │   └─► "Join Room Now" button
  │
  └─► User can:
      ├─► Copy link and share with others
      ├─► Scan QR code with mobile
      └─► Click "Join Room Now" → Go to "Join Room Flow"
```

### Workflow 3: Joining a Password-Protected Room

```
User clicks room link or enters room ID
  │
  ├─► Client sends GET /api/rooms/:roomId
  │
  ├─► Server checks room
  │   ├─► If not found: Return error
  │   ├─► If expired: Return error
  │   └─► If valid: Return { success: true, room: { requiresPassword } }
  │
  ├─► Client receives response
  │
  ├─► If requiresPassword = true:
  │   │
  │   ├─► Show password modal
  │   │
  │   ├─► User enters password
  │   │
  │   ├─► Client emits 'join-room' event
  │   │   └─► { roomId, password, identity, publicKey }
  │   │
  │   ├─► Server receives join request
  │   │
  │   ├─► Zero-Knowledge Proof Authentication
  │   │   ├─► Server generates random challenge
  │   │   ├─► Server emits 'password-challenge' → Client
  │   │   ├─► Client computes proof
  │   │   │   └─► proof = hash(password + challenge)
  │   │   ├─► Client emits 'password-proof' → Server
  │   │   ├─► Server verifies proof
  │   │   │   └─► Compare: hash(storedHash + challenge) === proof
  │   │   └─► If valid: Continue | If invalid: Reject
  │   │
  │   ├─► Server emits 'room-joined'
  │   │   └─► { roomId, peers, files, publicKeys }
  │   │
  │   └─► Client receives 'room-joined'
  │
  ├─► Client derives room key
  │   └─► roomKey = PBKDF2(roomId + password, 100000 iterations)
  │
  ├─► Client enters Incognito Mode
  │   ├─► Apply dark theme
  │   ├─► Show room badge with ID
  │   ├─► Show "Leave Room" button
  │   ├─► Hide "Create/Join" buttons
  │   ├─► Clear global files
  │   ├─► Load room files only
  │   └─► Show encryption status 🔒
  │
  └─► READY (Room Mode)
      ├─► Can share files in room (encrypted)
      ├─► Can see room files only
      └─► Isolated from global mode
```


### Workflow 4: File Sharing (Global Mode)

```
User selects files (drag-drop or click)
  │
  ├─► File input triggers
  │
  ├─► For each file:
  │   │
  │   ├─► Validate file
  │   │   ├─► Check size (max 2GB)
  │   │   └─► If too large: Show error, skip
  │   │
  │   ├─► Read file metadata
  │   │   ├─► name, size, type, lastModified
  │   │   └─► Generate unique file ID
  │   │
  │   ├─► Store file in memory
  │   │   └─► mySharedFiles.set(fileId, file)
  │   │
  │   ├─► Get expiration time from dropdown
  │   │
  │   ├─► Set expiration timer
  │   │   └─► setTimeout(() => removeFile(fileId), expiresIn)
  │   │
  │   ├─► Prepare metadata for broadcast
  │   │   └─► { id, name, size, type, peerId, publicKey, expiresAt }
  │   │
  │   └─► Emit to server
  │       └─► socket.emit('share-file', metadata)
  │
  ├─► Server receives 'share-file'
  │   ├─► Add to global files map
  │   │   └─► sharedFiles.set(fileId, metadata)
  │   ├─► Broadcast to all peers
  │   │   └─► io.emit('files-list', Array.from(sharedFiles.values()))
  │   └─► Log: "File shared: [name]"
  │
  ├─► All connected peers receive 'files-list'
  │   ├─► Update availableFiles array
  │   ├─► Render in "Available Files" section
  │   └─► Show file card with download button
  │
  └─► File is now available for download by any peer
```

### Workflow 5: File Sharing (Private Room Mode)

```
User selects files while in a room
  │
  ├─► File input triggers
  │
  ├─► For each file:
  │   │
  │   ├─► Validate file (same as global)
  │   │
  │   ├─► Read file metadata
  │   │
  │   ├─► Store file in memory
  │   │   └─► mySharedFiles.set(fileId, file)
  │   │       └─► Add _roomId property to track room
  │   │
  │   ├─► Prepare metadata with room ID
  │   │   └─► { id, name, size, type, peerId, publicKey, roomId, expiresAt }
  │   │
  │   └─► Emit to server
  │       └─► socket.emit('share-file', metadata)
  │
  ├─► Server receives 'share-file'
  │   ├─► Validate sender is in room
  │   ├─► Add to room's files map
  │   │   └─► room.files.set(fileId, metadata)
  │   ├─► Broadcast ONLY to room peers
  │   │   └─► room.peers.forEach(peer => 
  │   │         peer.emit('files-list', roomFiles))
  │   └─► Log: "File shared in room [roomId]"
  │
  ├─► Room peers receive 'files-list'
  │   ├─► Filter: only files with matching roomId
  │   ├─► Update availableFiles array
  │   ├─► Render with 🔒 encryption icon
  │   └─► Show "Encrypted transfer" badge
  │
  └─► File available ONLY to room members
      └─► Isolated from global mode
```


### Workflow 6: File Download (Complete P2P Transfer)

```
User clicks "Download" button
  │
  ├─► Call downloadFile(fileId, priority)
  │
  ├─► Find file in availableFiles
  │
  ├─► Add to Download Queue
  │   ├─► Create queue item
  │   │   └─► { id, fileInfo, priority, size, arrivalTime, status: 'waiting' }
  │   ├─► Apply scheduling algorithm
  │   │   ├─► FCFS: Sort by arrivalTime
  │   │   ├─► SJF: Sort by size (smallest first)
  │   │   └─► Priority: Sort by priority (highest first)
  │   └─► Update queue UI
  │
  ├─► Check Semaphore
  │   ├─► If slots available (< 3 concurrent):
  │   │   ├─► Acquire semaphore slot
  │   │   └─► Start download immediately
  │   └─► If full:
  │       └─► Wait in queue (status: 'waiting')
  │
  ├─► Start Download Process
  │   │
  │   ├─► Update queue item status: 'running'
  │   │
  │   ├─► Create RTCPeerConnection
  │   │   └─► pc = new RTCPeerConnection(rtcConfig)
  │   │       └─► rtcConfig includes STUN servers
  │   │
  │   ├─► Create Data Channel
  │   │   └─► dataChannel = pc.createDataChannel('fileTransfer')
  │   │
  │   ├─► Set up Data Channel handlers
  │   │   ├─► onopen: Request file
  │   │   ├─► onmessage: Receive chunks
  │   │   ├─► onerror: Handle errors
  │   │   └─► onclose: Cleanup
  │   │
  │   ├─► Generate SDP Offer
  │   │   ├─► offer = await pc.createOffer()
  │   │   └─► await pc.setLocalDescription(offer)
  │   │
  │   ├─► Send offer to peer via signaling
  │   │   └─► socket.emit('offer', { offer, targetPeerId })
  │   │
  │   └─► Wait for connection...
  │
  ├─► Peer (Sender) receives offer
  │   │
  │   ├─► Create RTCPeerConnection
  │   │
  │   ├─► Set remote description (offer)
  │   │
  │   ├─► Generate SDP Answer
  │   │   ├─► answer = await pc.createAnswer()
  │   │   └─► await pc.setLocalDescription(answer)
  │   │
  │   ├─► Send answer back via signaling
  │   │   └─► socket.emit('answer', { answer, targetPeerId })
  │   │
  │   └─► Set up data channel handler
  │       └─► pc.ondatachannel = (event) => { ... }
  │
  ├─► ICE Candidate Exchange
  │   ├─► Both peers gather ICE candidates
  │   ├─► Exchange via Socket.IO
  │   │   └─► socket.emit('ice-candidate', { candidate, targetPeerId })
  │   └─► NAT traversal using STUN servers
  │
  ├─► Data Channel Opens (P2P connection established)
  │   │
  │   ├─► Receiver sends file request
  │   │   └─► dataChannel.send(JSON.stringify({ type: 'request', fileId }))
  │   │
  │   └─► Sender receives request
  │
  ├─► Sender prepares file transfer
  │   │
  │   ├─► Find file in mySharedFiles
  │   │
  │   ├─► Check mode (Global vs Room)
  │   │
  │   ├─► IF GLOBAL MODE:
  │   │   ├─► Send metadata (unencrypted)
  │   │   │   └─► { name, size, type, encrypted: false }
  │   │   └─► Send file chunks (raw binary)
  │   │       ├─► Chunk size: 256KB (or 128KB for large files)
  │   │       ├─► Read chunk with FileReader
  │   │       ├─► Check buffer: if full, wait 20ms
  │   │       ├─► Send: dataChannel.send(chunkData)
  │   │       └─► Repeat until complete
  │   │
  │   └─► IF ROOM MODE:
  │       ├─► Generate session key (AES-256)
  │       ├─► Send metadata with session key
  │       │   └─► { name, size, type, encrypted: true, sessionKey }
  │       └─► For each chunk:
  │           ├─► Read chunk (256KB)
  │           ├─► Encrypt with room key
  │           │   └─► encrypted = AES-GCM(chunk, roomKey, randomIV)
  │           ├─► Package encrypted data
  │           │   └─► { data: base64(encrypted), roomIv: base64(IV), encrypted: true }
  │           ├─► Convert to JSON string
  │           ├─► Check buffer: if full, wait 20ms
  │           ├─► Send: dataChannel.send(packagedData)
  │           └─► Repeat until complete
  │
  ├─► Receiver processes incoming data
  │   │
  │   ├─► First message: Metadata
  │   │   ├─► Parse JSON
  │   │   ├─► Extract: name, size, encrypted flag
  │   │   ├─► If encrypted: Import session key
  │   │   └─► Initialize: receivedChunks = [], receivedSize = 0
  │   │
  │   ├─► Subsequent messages: File chunks
  │   │
  │   ├─► IF GLOBAL MODE (unencrypted):
  │   │   ├─► Receive raw binary chunk
  │   │   ├─► Push to receivedChunks array
  │   │   ├─► Update receivedSize
  │   │   ├─► Calculate speed and progress
  │   │   └─► Update UI
  │   │
  │   └─► IF ROOM MODE (encrypted):
  │       ├─► Receive JSON string
  │       ├─► Parse: { data, roomIv, encrypted }
  │       ├─► Decode base64 data
  │       ├─► Decrypt with room key
  │       │   └─► decrypted = AES-GCM-decrypt(data, roomKey, roomIv)
  │       ├─► Push decrypted chunk to array
  │       ├─► Update receivedSize
  │       ├─► Calculate speed and progress
  │       └─► Update UI (show "Decrypting...")
  │
  ├─► Monitor transfer progress
  │   ├─► Calculate speed every 100ms
  │   │   └─► speed = (sizeDelta / timeDelta)
  │   ├─► Update progress bar
  │   │   └─► progress = (receivedSize / totalSize) * 100
  │   ├─► Update active transfer UI
  │   └─► Update performance metrics
  │
  ├─► Transfer complete (receivedSize === totalSize)
  │   │
  │   ├─► Create Blob from all chunks
  │   │   └─► blob = new Blob(receivedChunks)
  │   │
  │   ├─► Trigger browser download
  │   │   ├─► Create object URL
  │   │   ├─► Create <a> element
  │   │   ├─► Set href and download attributes
  │   │   ├─► Click programmatically
  │   │   └─► Cleanup URL after 100ms
  │   │
  │   ├─► Update metrics
  │   │   ├─► totalDownloads++
  │   │   ├─► totalDataDownloaded += size
  │   │   ├─► Add to transfer history
  │   │   └─► Calculate average times
  │   │
  │   ├─► Remove from active transfers
  │   │
  │   ├─► Mark queue item as 'completed'
  │   │
  │   ├─► Release semaphore slot
  │   │   └─► semaphore.release()
  │   │
  │   ├─► Process next in queue
  │   │   └─► downloadQueue.processNextInQueue()
  │   │
  │   ├─► Show success toast
  │   │   └─► "🔓 File received & decrypted: [name]" (room mode)
  │   │   └─► "File received: [name]" (global mode)
  │   │
  │   └─► Clear memory
  │       └─► receivedChunks = []
  │
  └─► File saved to user's device
      └─► Browser's default download location
```


### Workflow 7: Queue Management & Scheduling

```
Multiple downloads requested
  │
  ├─► Each download added to queue
  │   └─► Queue item: { id, fileInfo, priority, size, arrivalTime, status }
  │
  ├─► Apply selected scheduling algorithm
  │
  ├─► ALGORITHM: FCFS (First Come First Serve)
  │   ├─► Sort by: arrivalTime (ascending)
  │   ├─► Process order: File1 → File2 → File3
  │   ├─► Pros: Fair, simple
  │   └─► Cons: Large files block small files
  │
  ├─► ALGORITHM: SJF (Shortest Job First)
  │   ├─► Sort by: size (ascending)
  │   ├─► Process order: Smallest → Largest
  │   ├─► Pros: Minimizes average wait time
  │   └─► Cons: Large files may starve
  │
  ├─► ALGORITHM: Priority Scheduling
  │   ├─► Sort by: priority (descending)
  │   ├─► User sets priority: 1 (low) to 10 (high)
  │   ├─► Priority 10: Jump to front of queue
  │   ├─► Process order: High priority → Low priority
  │   ├─► Pros: Important files first
  │   └─► Cons: Low priority may starve
  │
  ├─► Semaphore controls concurrency
  │   │
  │   ├─► Max concurrent: 3 downloads
  │   │
  │   ├─► Slot 1: Download A (running)
  │   ├─► Slot 2: Download B (running)
  │   ├─► Slot 3: Download C (running)
  │   │
  │   ├─► Queue: [D, E, F, G] (waiting)
  │   │
  │   ├─► When A completes:
  │   │   ├─► Release slot 1
  │   │   ├─► Get next from queue (D)
  │   │   ├─► Acquire slot 1
  │   │   └─► Start download D
  │   │
  │   └─► Prevents resource exhaustion
  │
  ├─► Performance metrics tracked
  │   ├─► Wait Time = startTime - arrivalTime
  │   ├─► Response Time = firstChunkTime - arrivalTime
  │   ├─► Turnaround Time = endTime - arrivalTime
  │   ├─► Throughput = completedDownloads / totalTime
  │   └─► Utilization = activeSlots / maxSlots * 100
  │
  └─► Queue UI updates in real-time
      ├─► Show waiting items
      ├─► Show average wait time
      └─► Show queue length
```

### Workflow 8: Leaving a Room

```
User clicks "Leave Room"
  │
  ├─► Confirm action
  │
  ├─► Clean up room files from mySharedFiles
  │   └─► Remove all files with _roomId === currentRoomId
  │
  ├─► Clean up download queue
  │   ├─► Remove queued items from this room
  │   └─► Cancel active transfers from this room
  │
  ├─► Emit leave-room event
  │   └─► socket.emit('leave-room', { roomId })
  │
  ├─► Server processes leave
  │   ├─► Remove peer from room.peers
  │   ├─► Remove peer's files from room.files
  │   ├─► Notify other room members
  │   └─► If room empty: Delete room
  │
  ├─► Client resets state
  │   ├─► currentRoomId = null
  │   ├─► currentRoomKey = null
  │   ├─► Clear availableFiles
  │   └─► Exit incognito mode
  │
  ├─► Update UI for global mode
  │   ├─► Remove dark theme
  │   ├─► Hide room badge
  │   ├─► Show "Create/Join" buttons
  │   ├─► Hide "Leave" button
  │   └─► Remove encryption status
  │
  ├─► Server sends global files list
  │   └─► Client receives and displays global files
  │
  └─► Back to Global Mode
      └─► Can see all global files again
```

## 📊 State Diagrams

### Application State Machine

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│                    DISCONNECTED                          │
│                                                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Browser opens
                     │ Socket connects
                     ▼
┌─────────────────────────────────────────────────────────┐
│                                                          │
│                   GLOBAL MODE                            │
│                                                          │
│  • Can share files globally                             │
│  • Can see all global files                             │
│  • Can create rooms                                     │
│  • Can join rooms                                       │
│                                                          │
└─────┬──────────────────────────────────────────┬────────┘
      │                                           │
      │ Create/Join Room                          │ Disconnect
      │                                           │
      ▼                                           ▼
┌─────────────────────────────────────────┐  ┌──────────┐
│                                          │  │          │
│          ROOM MODE                       │  │  OFFLINE │
│        (Incognito)                       │  │          │
│                                          │  └──────────┘
│  • Can share files in room (encrypted)  │
│  • Can see room files only              │
│  • Isolated from global                 │
│  • Can leave room                       │
│                                          │
└─────┬────────────────────────────────────┘
      │
      │ Leave Room
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│                                                          │
│                   GLOBAL MODE                            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Download State Machine

```
┌──────────┐
│  IDLE    │
└────┬─────┘
     │
     │ User clicks download
     ▼
┌──────────┐
│ QUEUED   │ ◄──┐
└────┬─────┘    │
     │          │ Queue full
     │          │
     │ Semaphore available
     ▼          │
┌──────────┐   │
│CONNECTING│───┘
└────┬─────┘
     │
     │ WebRTC connected
     ▼
┌──────────┐
│RECEIVING │
└────┬─────┘
     │
     │ All chunks received
     ▼
┌──────────┐
│COMPLETE  │
└────┬─────┘
     │
     │ Release semaphore
     ▼
┌──────────┐
│  IDLE    │
└──────────┘
```

## 🔐 Security Flow

### Zero-Knowledge Proof Authentication

```
Client                          Server
  │                               │
  │  1. join-room (roomId, pwd)   │
  ├──────────────────────────────►│
  │                               │
  │                          2. Generate
  │                             challenge
  │                               │
  │  3. password-challenge        │
  │◄──────────────────────────────┤
  │     (random bytes)            │
  │                               │
  4. Compute proof                │
     proof = hash(pwd + challenge)│
  │                               │
  │  5. password-proof            │
  ├──────────────────────────────►│
  │     (proof)                   │
  │                          6. Verify
  │                             stored = hash(hash + challenge)
  │                             if (stored === proof) ✓
  │                               │
  │  7. room-joined               │
  │◄──────────────────────────────┤
  │     (success)                 │
  │                               │
  ▼                               ▼
AUTHENTICATED                  VERIFIED
```

### Encryption Flow (Room Mode)

```
Sender                                          Receiver
  │                                               │
  │  1. Derive room key                           │
  │     PBKDF2(roomId + password)                 │
  │                                               │
  │  2. Read file chunk                           │
  │                                               │
  │  3. Encrypt                                   │
  │     encrypted = AES-256-GCM(chunk, roomKey)   │
  │     Generate random IV                        │
  │                                               │
  │  4. Package                                   │
  │     {data, roomIv, encrypted: true}           │
  │                                               │
  │  5. Send via WebRTC                           │
  ├──────────────────────────────────────────────►│
  │                                               │
  │                                          6. Receive
  │                                               │
  │                                          7. Decrypt
  │                                             AES-256-GCM
  │                                             (roomKey, IV)
  │                                               │
  │                                          8. Verify
  │                                             integrity
  │                                               │
  │                                          9. Store chunk
  │                                               │
  ▼                                               ▼
SENT                                          RECEIVED
```

## 📈 Performance Monitoring Flow

```
Transfer starts
  │
  ├─► Initialize metrics
  │   ├─► startTime = now
  │   ├─► lastProgressTime = now
  │   └─► lastReceivedSize = 0
  │
  ├─► Every 100ms:
  │   ├─► Calculate speed
  │   │   └─► speed = (sizeDelta / timeDelta)
  │   ├─► Update progress
  │   │   └─► progress = (received / total) * 100
  │   ├─► Update UI
  │   │   ├─► Progress bar
  │   │   ├─► Speed indicator
  │   │   └─► Time remaining
  │   └─► Update graph
  │       └─► Add data point to speed history
  │
  ├─► Transfer completes
  │   ├─► Calculate final metrics
  │   │   ├─► Total time
  │   │   ├─► Average speed
  │   │   ├─► Wait time
  │   │   └─► Turnaround time
  │   ├─► Update statistics
  │   │   ├─► totalDownloads++
  │   │   ├─► totalDataDownloaded += size
  │   │   └─► Update averages
  │   └─► Add to history
  │       └─► transferHistory.push(metrics)
  │
  └─► Display in UI
      ├─► Performance card
      ├─► Speed graph
      └─► Statistics panel
```

---

## 🎯 Summary

This document provides detailed step-by-step workflows for all major features:

1. **User onboarding** - Identity setup and connection
2. **Room management** - Creating and joining private rooms
3. **File sharing** - Both global and private room modes
4. **P2P transfers** - Complete download process with encryption
5. **Queue management** - Scheduling algorithms and semaphore control
6. **Security** - Zero-knowledge proof and encryption flows
7. **Performance** - Real-time monitoring and metrics

Each workflow shows the exact sequence of events, data flow, and state transitions that occur in the application.
