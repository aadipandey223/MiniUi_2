# Team Member 2: P2P Transfer, Encryption & OS Concepts

## Your Responsibility
**Core File Transfer System, Security, and Operating System Concepts**

You are responsible for the peer-to-peer file transfer, all encryption, and implementing OS concepts.

## Your Files
```
public/
├── app.js               ← All P2P logic, encryption, OS concepts (~3,300 lines)
├── crypto-client.js     ← Client-side encryption implementation
utils/
└── crypto.js           ← Server-side crypto utilities
```

---

## PART 1: WebRTC & P2P File Transfer

### 1. WebRTC Connection Management

#### Peer Connection Setup
```javascript
- 7 STUN servers for NAT traversal
- ICE candidate exchange
- Data channel creation
- Connection state monitoring
- Automatic reconnection
```

#### Key Functions
```javascript
createPeerConnection()    // Establish P2P connection
setupDataChannel()        // Create file transfer channel
handleOffer()            // Accept connection request
handleAnswer()           // Complete connection handshake
handleIceCandidate()     // Exchange network info
```

### 2. File Transfer System

#### Sending Files
- **Adaptive Chunking**: 256KB for small files, 128KB for large files (>500MB)
- **Buffer Management**: Monitor and control send buffer
- **Flow Control**: Pause when buffer full, resume when drained
- **Progress Tracking**: Real-time upload progress and speed
- **Error Handling**: Timeout, retry, cleanup

#### Receiving Files
- **Chunk Assembly**: Reconstruct file from chunks
- **Memory Optimization**: Flush buffers every 50MB for large files
- **Progress Display**: Show percentage, speed, ETA
- **Blob Creation**: Convert chunks to downloadable file
- **Automatic Download**: Trigger browser download

### 3. Advanced Features

#### Adaptive Chunk Size
```javascript
if (fileSize > 500MB) {
    chunkSize = 128KB;  // Smaller chunks for stability
} else {
    chunkSize = 256KB;  // Larger chunks for speed
}
```

#### Flow Control Algorithm
```javascript
1. Check buffer size before sending
2. If buffer > chunkSize: wait 20ms
3. Send chunk
4. Update progress
5. Repeat until complete
```

#### Mobile Optimization
- Detect mobile devices
- Warn for files >500MB on mobile
- Adaptive memory management
- 30-minute timeout for large files
- File System Access API for large files

---

## PART 2: Triple-Layer Encryption

### 1. Layer 1: Session Encryption (AES-256-GCM)

#### Purpose
- Unique key per file transfer
- Ephemeral (temporary) keys
- Forward secrecy

#### Implementation
```javascript
1. Generate random 256-bit key
2. Generate random 96-bit IV
3. Encrypt chunk with AES-256-GCM
4. Send encrypted data + IV
5. Receiver decrypts with same key + IV
```

### 2. Layer 2: Room Encryption (AES-256-GCM)

#### Purpose
- Isolate room data
- Prevent cross-room access
- Room-specific security

#### Implementation
```javascript
1. Derive room key from room ID + password
2. Encrypt already-encrypted chunk
3. Add room-specific IV
4. Only room members can decrypt
```

### 3. Layer 3: Digital Signatures (RSA-OAEP)

#### Purpose
- Verify sender identity
- Prevent tampering
- Non-repudiation

#### Implementation
```javascript
1. Generate RSA key pair (2048-bit)
2. Sign encrypted data with private key
3. Send data + signature
4. Receiver verifies with public key
5. Reject if signature invalid
```

### 4. Zero-Knowledge Password System

#### Challenge-Response Protocol
```javascript
Client Side:
1. User enters password
2. Receive challenge from server
3. Compute: proof = hash(password + challenge)
4. Send proof to server

Server Side:
1. Generate random challenge
2. Send to client
3. Receive proof
4. Verify: proof == hash(storedHash + challenge)
5. Never sees actual password
```

#### Security Benefits
- Server never stores passwords
- Passwords never transmitted
- Resistant to replay attacks
- Cryptographically secure

---

## PART 3: Operating System Concepts

### 1. Download Queue (CPU Scheduling)

#### Three Scheduling Algorithms

**FCFS (First Come First Serve)**
```javascript
- Downloads in order received
- Fair to all users
- Simple implementation
- Like a queue at a store
```

**SJF (Shortest Job First)**
```javascript
- Small files download first
- Minimizes average wait time
- Optimal for throughput
- Like express checkout lane
```

**Priority Scheduling**
```javascript
- Important files jump queue
- User can set priority (1-10)
- Priority 10+ goes to front
- Like VIP lane
```

#### Queue Implementation
```javascript
class DownloadQueue {
    queue = [];              // Waiting downloads
    activeDownloads = Set(); // Currently downloading
    
    addToQueue(file, priority)
    sortQueue()              // Apply scheduling algorithm
    getNext()               // Get next file to download
    startDownload(id)
    completeDownload(id)
    processNextInQueue()
}
```

### 2. Semaphore (Resource Management)

#### Purpose
- Limit concurrent downloads to 3
- Prevent system overload
- Fair resource allocation
- Classic OS synchronization primitive

#### Implementation
```javascript
class Semaphore {
    maxConcurrent = 3;      // Max simultaneous downloads
    currentCount = 0;       // Currently active
    
    canAcquire() {
        return currentCount < maxConcurrent;
    }
    
    acquire() {
        if (canAcquire()) {
            currentCount++;
            return true;
        }
        return false;
    }
    
    release() {
        currentCount--;
        processNextInQueue();  // Start waiting download
    }
}
```

#### How It Works
```
Download 1: acquire() → currentCount = 1 → START
Download 2: acquire() → currentCount = 2 → START
Download 3: acquire() → currentCount = 3 → START
Download 4: acquire() → BLOCKED (wait in queue)

Download 1 completes: release() → currentCount = 2
Download 4: acquire() → currentCount = 3 → START
```

### 3. Performance Monitoring

#### Metrics Tracked
```javascript
Transfer Statistics:
- Total downloads/uploads
- Failed transfers
- Completed transfers

Network Performance:
- Current download/upload speed
- Peak speed achieved
- Total data transferred

Scheduling Metrics:
- Average wait time
- Average turnaround time
- Average response time
- Throughput (files/minute)

Resource Utilization:
- Semaphore utilization %
- Active connections
- Blocked requests
```

#### Real-Time Dashboard
- Live speed graph (canvas)
- Active transfers display
- Queue status
- Performance statistics

---

## Your Contribution Explained

### For Presentation (15-18 minutes):

**Part 1: P2P File Transfer (5-6 min)**

"I implemented the core peer-to-peer file transfer system:

1. **WebRTC Implementation**: Built a system where files transfer directly between browsers at maximum network speed - no server storage, completely peer-to-peer

2. **Smart Chunking**: Designed an adaptive system:
   - 256KB chunks for small files (maximum speed)
   - 128KB chunks for large files >500MB (stability)
   - Automatically adjusts based on file size

3. **Buffer Management**: Implemented sophisticated flow control:
   - Monitor send buffer size
   - Pause when buffer full
   - Resume after 20ms
   - Prevents memory overflow

4. **Mobile Optimization**: 
   - Detect mobile devices
   - Warn for large files (>500MB)
   - Memory management
   - File System Access API for large files

5. **Performance**: Transfers up to 100+ MB/s depending on network"

**Part 2: Security & Encryption (5-6 min)**

"I developed a comprehensive security system:

1. **Triple-Layer Encryption**:
   - Layer 1: Session keys (AES-256-GCM) - unique per file
   - Layer 2: Room keys (AES-256-GCM) - isolate private rooms
   - Layer 3: Digital signatures (RSA-OAEP) - verify sender

2. **Zero-Knowledge Authentication**: 
   - Server never sees passwords
   - Challenge-response protocol
   - Cryptographic proofs only
   - Resistant to attacks

3. **End-to-End Security**:
   - Keys generated in browser
   - Encryption before sending
   - Decryption after receiving
   - Server never sees data"

**Part 3: Operating System Concepts (5-6 min)**

"I implemented classic OS concepts:

1. **CPU Scheduling Algorithms**:
   - FCFS: First-come first-served (fair)
   - SJF: Shortest job first (fast)
   - Priority: Important files first (flexible)
   - Just like an OS schedules processes!

2. **Semaphore Implementation**:
   - Limits concurrent downloads to 3
   - Prevents system overload
   - Fair resource allocation
   - Classic synchronization primitive

3. **Performance Monitoring**:
   - Track 15+ metrics
   - Wait time, turnaround time
   - Throughput, utilization
   - Real-time dashboard"

**Demo (2 min)**
- Show file transfer with real-time speed
- Demonstrate encryption (show encrypted data)
- Show queue with scheduling
- Demonstrate semaphore (try 4th download)
- Show performance metrics

---

## Technical Skills Demonstrated

### Networking & P2P
- WebRTC API mastery
- P2P networking concepts
- Binary data handling (ArrayBuffer, Blob)
- Flow control algorithms
- NAT traversal

### Cryptography
- AES-256-GCM encryption
- RSA-OAEP signatures
- Web Crypto API
- Zero-knowledge proofs
- Key management
- SHA-256 hashing

### Operating Systems
- CPU scheduling algorithms
- Semaphore implementation
- Resource management
- Performance monitoring
- Memory management
- Deadlock prevention

### Software Engineering
- Error handling
- Performance optimization
- Mobile optimization
- Code organization
- Testing and debugging

---

## Code Statistics

| Metric | Value |
|--------|-------|
| **Total Lines of Code** | ~3,300 lines |
| **Functions Written** | 80+ functions |
| **Encryption Layers** | 3 layers |
| **Key Sizes** | 256-bit AES, 2048-bit RSA |
| **Chunk Sizes** | 128KB - 256KB adaptive |
| **Max File Size** | 2 GB |
| **Transfer Speed** | Up to 100+ MB/s |
| **Concurrent Limit** | 3 (semaphore) |
| **Scheduling Algorithms** | 3 algorithms |
| **Metrics Tracked** | 15+ metrics |
| **STUN Servers** | 7 servers |

---

## Key Algorithms

### 1. File Chunking with Flow Control
```
1. Determine chunk size (128KB or 256KB)
2. Read file chunk
3. Encrypt chunk (triple-layer)
4. Check buffer size
5. If buffer > chunkSize:
   - Wait 20ms
   - Send chunk
   - Continue
6. Else:
   - Send immediately
   - Continue
7. Update progress
8. Repeat until complete
```

### 2. Triple-Layer Encryption
```
Sending:
1. Read chunk
2. Encrypt with session key (Layer 1)
3. If in room: encrypt with room key (Layer 2)
4. Sign with RSA private key (Layer 3)
5. Send: encrypted data + signature + IVs

Receiving:
1. Receive encrypted data + signature
2. Verify signature with public key (Layer 3)
3. If in room: decrypt with room key (Layer 2)
4. Decrypt with session key (Layer 1)
5. Assemble chunk
```

### 3. Semaphore with Queue Processing
```
Download Request:
1. Add to queue with priority
2. Sort queue by algorithm (FCFS/SJF/Priority)
3. Try to acquire semaphore
4. If acquired:
   - Start download
   - currentCount++
5. Else:
   - Wait in queue

Download Complete:
1. Release semaphore
2. currentCount--
3. Get next from queue
4. If available and can acquire:
   - Start next download
```

### 4. Zero-Knowledge Password Verification
```
Client:
1. password = user input
2. challenge = receive from server
3. proof = SHA256(SHA256(password) + challenge)
4. send proof

Server:
1. challenge = random bytes
2. send challenge
3. proof = receive from client
4. expected = SHA256(storedHash + challenge)
5. if (proof == expected): verified
```

---

## Demo Points

### 1. P2P File Transfer (4 min)
- Upload a file (show in shared files)
- Download from another browser
- Show real-time speed (50+ MB/s)
- Show progress bar updating
- File downloads directly (no server)

### 2. Encryption (4 min)
- Open browser console
- Show encrypted data being sent
- Explain triple-layer encryption
- Show signature verification
- Demonstrate zero-knowledge password

### 3. OS Concepts (4 min)
- Add 5 files to download queue
- Show FCFS scheduling (order)
- Change to SJF (small files first)
- Try priority download (jumps queue)
- Try 4th download (semaphore blocks)
- Show performance metrics

### 4. Large File & Mobile (3 min)
- Download 500MB+ file
- Show adaptive chunk size (128KB)
- Show mobile warning dialog
- Demonstrate stable transfer
- Show memory management

---

## Challenges & Solutions

### Challenge 1: Large Files Crashing Mobile
**Problem**: 1GB file crashes mobile browser (out of memory)
**Solution**:
- Adaptive chunk sizes (smaller for large files)
- Buffer flushing every 50MB
- Mobile device detection
- Warning dialogs for users
- 30-minute timeout

### Challenge 2: Buffer Overflow Stalling Transfers
**Problem**: Sending too fast fills buffer, transfer stops
**Solution**:
- Monitor bufferedAmount
- Pause when buffer > chunkSize
- Wait 20ms for buffer to drain
- Resume sending
- Smooth flow control

### Challenge 3: Security Without Server Access
**Problem**: How to encrypt without server seeing data?
**Solution**:
- Triple-layer encryption
- Keys generated in browser
- Zero-knowledge password verification
- End-to-end security
- Server only handles signaling

### Challenge 4: Fair Download Management
**Problem**: Which file to download first? Too many downloads crash browser
**Solution**:
- Implemented 3 scheduling algorithms
- Semaphore limits to 3 concurrent
- User can choose algorithm
- Priority system for important files

---

## For Your Report

### Abstract
"Implemented a complete peer-to-peer file transfer system using WebRTC with adaptive chunking and flow control. Developed a triple-layer encryption system using AES-256-GCM and RSA-OAEP with zero-knowledge password verification. Implemented operating system concepts including three CPU scheduling algorithms (FCFS, SJF, Priority) and semaphore-based resource management for download queue handling with comprehensive performance monitoring."

### Technologies Used
- WebRTC Data Channels
- Web Crypto API (AES-256-GCM, RSA-OAEP, SHA-256)
- JavaScript (ES6+)
- Binary data handling (ArrayBuffer, Blob, Uint8Array)
- Canvas API (performance graphs)
- File System Access API

### Key Contributions
1. Designed and implemented WebRTC P2P file transfer
2. Developed triple-layer encryption system
3. Implemented zero-knowledge password verification
4. Created three CPU scheduling algorithms
5. Implemented semaphore for resource management
6. Built comprehensive performance monitoring system
7. Optimized for mobile devices
8. Implemented adaptive chunking and flow control

---

**Your role is the technical core - you built the entire file transfer, security, and OS concepts!** 🚀🔐
