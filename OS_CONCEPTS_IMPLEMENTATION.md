# 🖥️ Operating System Concepts Implementation

Complete documentation of OS concepts used in this P2P File Sharing Application.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Process Scheduling](#process-scheduling)
3. [Semaphore (Synchronization)](#semaphore-synchronization)
4. [Performance Metrics](#performance-metrics)
5. [Memory Management](#memory-management)
6. [Implementation Details](#implementation-details)

---

## 🎯 Overview

This application implements several **Operating System concepts** to manage file transfers efficiently:

### OS Concepts Used:
1. ✅ **CPU Scheduling Algorithms** (FCFS, SJF, Priority)
2. ✅ **Semaphore** (Resource synchronization)
3. ✅ **Performance Monitoring** (Metrics tracking)
4. ✅ **Memory Management** (Buffer management)
5. ✅ **Queue Management** (Download queue)

---

## 📊 1. Process Scheduling

### Concept: CPU Scheduling Algorithms
**File**: `public/app.js`  
**Lines**: 392-492  
**Class**: `DownloadQueue`

### Implementation

#### Class Definition
```javascript
// Line 392-398
class DownloadQueue {
    constructor() {
        this.queue = [];
        this.activeDownloads = new Set();
        this.completedDownloads = [];
        this.schedulingAlgorithm = 'FCFS'; // FCFS, SJF, Priority
    }
}
```

**Location**: `public/app.js:392-398`

---

### 1.1 First Come First Serve (FCFS)

#### Theory
- Processes are executed in the order they arrive
- Non-preemptive scheduling
- Simple but can cause convoy effect

#### Implementation
```javascript
// Line 425-429
sortQueue() {
    switch(this.schedulingAlgorithm) {
        case 'FCFS': // First Come First Serve
            this.queue.sort((a, b) => a.arrivalTime - b.arrivalTime);
            break;
    }
}
```

**Location**: `public/app.js:425-429`

#### How It Works
1. Files added to queue get `arrivalTime = Date.now()`
2. Queue sorted by arrival time (earliest first)
3. Downloads processed in order of arrival

#### Example
```
File A arrives at 10:00:00 → Position 1
File B arrives at 10:00:05 → Position 2
File C arrives at 10:00:10 → Position 3
Download order: A → B → C
```

---

### 1.2 Shortest Job First (SJF)

#### Theory
- Shortest process executed first
- Minimizes average waiting time
- Can cause starvation of large files

#### Implementation
```javascript
// Line 430-432
case 'SJF': // Shortest Job First
    this.queue.sort((a, b) => a.size - b.size);
    break;
```

**Location**: `public/app.js:430-432`

#### How It Works
1. Files sorted by size (smallest first)
2. Small files download before large files
3. Optimizes average completion time

#### Example
```
File A: 100 MB → Position 3
File B: 10 MB  → Position 1
File C: 50 MB  → Position 2
Download order: B → C → A
```

---

### 1.3 Priority Scheduling

#### Theory
- Processes with higher priority execute first
- Can be preemptive or non-preemptive
- Risk of starvation for low-priority processes

#### Implementation
```javascript
// Line 433-435
case 'Priority': // Priority Scheduling
    this.queue.sort((a, b) => b.priority - a.priority);
    break;
```

**Location**: `public/app.js:433-435`

#### Priority Assignment
```javascript
// Line 400-423
addToQueue(fileInfo, priority = 1) {
    const queueItem = {
        id: Date.now() + Math.random(),
        fileInfo: fileInfo,
        priority: priority,  // 1 = Low, 5 = Normal, 10 = High
        size: fileInfo.size,
        arrivalTime: Date.now(),
        startTime: null,
        endTime: null,
        status: 'waiting'
    };
    
    // Priority items go first, then FCFS
    if (priority >= 10) {
        this.queue.unshift(queueItem);  // Insert at front
    } else {
        this.queue.push(queueItem);     // Insert at back
    }
}
```

**Location**: `public/app.js:400-423`

#### Priority Levels
- **Low Priority**: 1 (Normal queue position)
- **Normal Priority**: 5 (Default)
- **High Priority**: 10+ (Jump to front of queue)

#### Example
```
File A: Priority 1  → Position 3
File B: Priority 10 → Position 1 (High priority)
File C: Priority 5  → Position 2
Download order: B → C → A
```

---

### Queue State Transitions

```
┌─────────┐
│ WAITING │ ──acquire()──> ┌─────────┐
└─────────┘                 │ RUNNING │
                            └─────────┘
                                 │
                          complete()
                                 │
                                 ▼
                            ┌───────────┐
                            │ COMPLETED │
                            └───────────┘
```

#### State Management
```javascript
// Line 444-463
startDownload(queueId) {
    const item = this.queue.find(q => q.id === queueId);
    if (item) {
        item.status = 'running';
        item.startTime = Date.now();
        this.activeDownloads.add(queueId);
        this.updateQueueUI();
    }
}

completeDownload(queueId) {
    const item = this.queue.find(q => q.id === queueId);
    if (item) {
        item.status = 'completed';
        item.endTime = Date.now();
        this.activeDownloads.delete(queueId);
        this.completedDownloads.push(item);
        this.queue = this.queue.filter(q => q.id !== queueId);
        this.updateQueueUI();
        this.processNextInQueue();
    }
}
```

**Location**: `public/app.js:444-463`

---

### Scheduling Metrics Calculated

#### Wait Time
Time from arrival to start of execution
```javascript
waitTime = startTime - arrivalTime
```

#### Turnaround Time
Total time from arrival to completion
```javascript
turnaroundTime = endTime - arrivalTime
```

#### Response Time
Time from arrival to first response
```javascript
responseTime = firstChunkTime - startTime
```

**Calculation Location**: `public/app.js:1626-1642`

---

## 🔒 2. Semaphore (Synchronization)

### Concept: Resource Synchronization
**File**: `public/app.js`  
**Lines**: 495-528  
**Class**: `Semaphore`

### Theory
A semaphore is a synchronization primitive that controls access to a shared resource through counters.

#### Types
- **Binary Semaphore**: 0 or 1 (mutex)
- **Counting Semaphore**: 0 to N (resource pool)

This implementation uses a **Counting Semaphore**.

---

### Implementation

#### Class Definition
```javascript
// Line 495-528
class Semaphore {
    constructor(maxConcurrent = 999999) {
        this.maxConcurrent = maxConcurrent;  // Maximum concurrent downloads
        this.currentCount = 0;                // Current active downloads
        this.waiting = [];                    // Waiting queue (unused in current impl)
    }
    
    canAcquire() {
        return this.currentCount < this.maxConcurrent;
    }
    
    acquire() {
        if (this.canAcquire()) {
            this.currentCount++;
            updatePerformanceMetrics();
            return true;
        }
        return false;
    }
    
    release() {
        if (this.currentCount > 0) {
            this.currentCount--;
            updatePerformanceMetrics();
            // Process waiting downloads
            downloadQueue.processNextInQueue();
        }
    }
    
    getUtilization() {
        return this.currentCount > 0 ? 
            ((this.currentCount / Math.min(this.maxConcurrent, 10)) * 100).toFixed(1) : '0';
    }
}
```

**Location**: `public/app.js:495-528`

---

### Initialization
```javascript
// Line 531
const semaphore = new Semaphore(999999); // Unlimited concurrent downloads
```

**Location**: `public/app.js:531`

**Note**: Set to 999999 (effectively unlimited) for maximum performance. Can be changed to limit concurrent downloads.

---

### Semaphore Operations

#### 1. Acquire (P operation / wait)
```javascript
// Line 508-513
acquire() {
    if (this.canAcquire()) {
        this.currentCount++;
        updatePerformanceMetrics();
        return true;
    }
    return false;
}
```

**When Called**:
- Before starting a download
- Location: `public/app.js:478`

```javascript
// Line 474-480
if (semaphore.canAcquire() && this.queue.length > 0) {
    const next = this.getNext();
    if (next) {
        console.log('Starting next download:', next.fileInfo.name);
        semaphore.acquire();  // ← ACQUIRE
        downloadFileFromQueue(next);
    }
}
```

---

#### 2. Release (V operation / signal)
```javascript
// Line 515-522
release() {
    if (this.currentCount > 0) {
        this.currentCount--;
        updatePerformanceMetrics();
        // Process waiting downloads
        downloadQueue.processNextInQueue();
    }
}
```

**When Called**:
- After download completes: `public/app.js:1397, 1485`
- After download fails: `public/app.js:1091, 1499`
- When file removed: `public/app.js:321, 337, 853`
- When queue item removed: `public/app.js:2552`

**Example Locations**:
```javascript
// Line 1397 - Download complete
downloadQueue.completeDownload(queueId);
semaphore.release();  // ← RELEASE

// Line 1091 - Download failed
downloadQueue.completeDownload(queueItem.id);
semaphore.release();  // ← RELEASE

// Line 321 - Room cleanup
if (item.status === 'running') {
    semaphore.release();  // ← RELEASE
}
```

---

### Critical Section Protection

#### Problem: Race Condition
Multiple downloads trying to start simultaneously could exceed the limit.

#### Solution: Semaphore
```javascript
// Line 466-483
processNextInQueue() {
    console.log('processNextInQueue called', {
        canAcquire: semaphore.canAcquire(),
        currentCount: semaphore.currentCount,
        maxConcurrent: semaphore.maxConcurrent,
        queueLength: this.queue.length,
        waitingItems: this.queue.filter(q => q.status === 'waiting').length
    });
    
    // CRITICAL SECTION START
    if (semaphore.canAcquire() && this.queue.length > 0) {
        const next = this.getNext();
        if (next) {
            semaphore.acquire();  // Lock resource
            downloadFileFromQueue(next);
        }
    }
    // CRITICAL SECTION END
}
```

**Location**: `public/app.js:466-483`

---

### Semaphore State Diagram

```
┌──────────────────────────────────────┐
│  Semaphore (maxConcurrent = 3)       │
├──────────────────────────────────────┤
│  currentCount = 0  [Available: 3]    │
│         ↓ acquire()                  │
│  currentCount = 1  [Available: 2]    │
│         ↓ acquire()                  │
│  currentCount = 2  [Available: 1]    │
│         ↓ acquire()                  │
│  currentCount = 3  [Available: 0]    │ ← FULL
│         ↓ acquire() → BLOCKED        │
│         ↓ release()                  │
│  currentCount = 2  [Available: 1]    │
│         ↓ processNextInQueue()       │
│  currentCount = 3  [Available: 0]    │
└──────────────────────────────────────┘
```

---

### Resource Utilization

#### Calculation
```javascript
// Line 524-526
getUtilization() {
    return this.currentCount > 0 ? 
        ((this.currentCount / Math.min(this.maxConcurrent, 10)) * 100).toFixed(1) : '0';
}
```

**Location**: `public/app.js:524-526`

#### Display
```javascript
// Line 1648-1650
performanceMetrics.resourceUtilization = parseFloat(semaphore.getUtilization());
performanceMetrics.blockedRequests = downloadQueue.queue.filter(q => q.status === 'waiting').length;
performanceMetrics.activeConnections = semaphore.currentCount;
```

**Location**: `public/app.js:1648-1650`

---

## 📈 3. Performance Metrics

### Concept: System Monitoring
**File**: `public/app.js`  
**Lines**: 534-571  
**Object**: `performanceMetrics`

### Implementation

#### Metrics Object
```javascript
// Line 534-571
const performanceMetrics = {
    // Transfer Statistics
    totalDownloads: 0,
    totalUploads: 0,
    failedTransfers: 0,
    
    // Network Performance
    currentDownloadSpeed: 0,
    currentUploadSpeed: 0,
    peakDownloadSpeed: 0,
    totalDataDownloaded: 0,
    totalDataUploaded: 0,
    
    // Memory Usage (Application Level)
    filesInMemory: 0,
    memoryUsedMB: 0,
    bufferSizeMB: 0,
    
    // Connection Statistics
    activeConnections: 0,
    totalConnectionAttempts: 0,
    averageConnectionTime: 0,
    
    // Scheduling Metrics (OS Concepts)
    averageWaitTime: 0,
    averageTurnaroundTime: 0,
    averageResponseTime: 0,
    throughput: 0,
    
    // Semaphore Status
    resourceUtilization: 0,
    blockedRequests: 0,
    
    // Timestamps
    startTime: Date.now(),
    lastUpdateTime: Date.now()
};
```

**Location**: `public/app.js:534-571`

---

### 3.1 Scheduling Metrics (OS Concepts)

#### Average Wait Time
Time processes spend waiting in queue before execution.

**Formula**:
```
Average Wait Time = Σ(startTime - arrivalTime) / n
```

**Implementation**:
```javascript
// Line 1630-1636
const completed = downloadQueue.completedDownloads;
if (completed.length > 0) {
    const totalWait = completed.reduce((sum, item) => 
        sum + (item.startTime - item.arrivalTime), 0);
    
    performanceMetrics.averageWaitTime = totalWait / completed.length / 1000;
}
```

**Location**: `public/app.js:1630-1636`

---

#### Average Turnaround Time
Total time from arrival to completion.

**Formula**:
```
Average Turnaround Time = Σ(endTime - arrivalTime) / n
```

**Implementation**:
```javascript
// Line 1633-1637
const totalTurnaround = completed.reduce((sum, item) => 
    sum + (item.endTime - item.arrivalTime), 0);

performanceMetrics.averageTurnaroundTime = totalTurnaround / completed.length / 1000;
```

**Location**: `public/app.js:1633-1637`

---

#### Average Response Time
Time from arrival to first response (first chunk received).

**Formula**:
```
Average Response Time = Σ(responseTime) / n
```

**Implementation**:
```javascript
// Line 1635-1638
const totalResponse = completed.reduce((sum, item) => 
    sum + (item.responseTime || 0), 0);

performanceMetrics.averageResponseTime = totalResponse / completed.length / 1000;
```

**Location**: `public/app.js:1635-1638`

---

#### Throughput
Number of processes completed per unit time.

**Formula**:
```
Throughput = completed_processes / time_elapsed * 60
```

**Implementation**:
```javascript
// Line 1639
performanceMetrics.throughput = completed.length / uptime * 60;
```

**Location**: `public/app.js:1639`

**Unit**: Transfers per minute

---

### 3.2 Network Performance Metrics

#### Download Speed
```javascript
// Line 1348-1352
const timeDelta = (now - lastProgressTime) / 1000;
if (timeDelta > 0.1) {
    const sizeDelta = receivedSize - lastReceivedSize;
    const speedBytesPerSec = sizeDelta / timeDelta;
    performanceMetrics.currentDownloadSpeed = speedBytesPerSec;
}
```

**Location**: `public/app.js:1348-1352`

#### Upload Speed
```javascript
// Line 1190-1196
const timeDelta = (now - lastProgressTime) / 1000;
if (timeDelta > 0.1) {
    const sizeDelta = offset - lastSentSize;
    const speedBytesPerSec = sizeDelta / timeDelta;
    performanceMetrics.currentUploadSpeed = speedBytesPerSec;
}
```

**Location**: `public/app.js:1190-1196`

---

### 3.3 Memory Management Metrics

#### Files in Memory
```javascript
// Line 977
performanceMetrics.filesInMemory = mySharedFiles.size;
```

**Location**: `public/app.js:977`

#### Memory Used
```javascript
// Line 978-980
performanceMetrics.memoryUsedMB = Array.from(mySharedFiles.values())
    .reduce((sum, f) => sum + f.size, 0) / (1024 * 1024);
```

**Location**: `public/app.js:978-980`

#### Buffer Size
```javascript
// Line 1125
performanceMetrics.bufferSizeMB = chunkSize / (1024 * 1024);
```

**Location**: `public/app.js:1125`

---

### 3.4 Connection Metrics

#### Active Connections
```javascript
// Line 1650
performanceMetrics.activeConnections = semaphore.currentCount;
```

**Location**: `public/app.js:1650`

#### Average Connection Time
```javascript
// Line 1300-1302
const connectionTime = startTime - connectionStartTime;
const totalConnectionTime = performanceMetrics.averageConnectionTime * performanceMetrics.totalDownloads;
performanceMetrics.averageConnectionTime = (totalConnectionTime + connectionTime) / (performanceMetrics.totalDownloads + 1);
```

**Location**: `public/app.js:1300-1302`

---

### Metrics Update Function

```javascript
// Line 1626-1654
function updatePerformanceMetrics() {
    const uptime = (Date.now() - performanceMetrics.startTime) / 1000;
    
    // Calculate scheduling metrics (OS Concepts)
    const completed = downloadQueue.completedDownloads;
    if (completed.length > 0) {
        const totalWait = completed.reduce((sum, item) => 
            sum + (item.startTime - item.arrivalTime), 0);
        const totalTurnaround = completed.reduce((sum, item) => 
            sum + (item.endTime - item.arrivalTime), 0);
        const totalResponse = completed.reduce((sum, item) => 
            sum + (item.responseTime || 0), 0);
        
        performanceMetrics.averageWaitTime = totalWait / completed.length / 1000;
        performanceMetrics.averageTurnaroundTime = totalTurnaround / completed.length / 1000;
        performanceMetrics.averageResponseTime = totalResponse / completed.length / 1000;
        performanceMetrics.throughput = completed.length / uptime * 60;
    }
    
    // Semaphore metrics
    performanceMetrics.resourceUtilization = parseFloat(semaphore.getUtilization());
    performanceMetrics.blockedRequests = downloadQueue.queue.filter(q => q.status === 'waiting').length;
    performanceMetrics.activeConnections = semaphore.currentCount;
    
    // Update UI
    updatePerformanceUI();
}
```

**Location**: `public/app.js:1626-1654`

**Called**: Every 1 second (Line 1682)

---

## 💾 4. Memory Management

### Concept: Buffer Management
**File**: `public/app.js`

### Chunk-Based Transfer

#### Chunk Size
```javascript
// Line 1107
const chunkSize = 262144; // 256KB chunks for faster transfer
```

**Location**: `public/app.js:1107`

**Why 256KB?**
- Balance between memory usage and transfer speed
- Prevents browser memory overflow
- Optimal for WebRTC DataChannel

---

### Buffer Management During Upload

```javascript
// Line 1165-1175
reader.onload = async (e) => {
    // Check buffer before sending to prevent blocking
    if (dataChannel.bufferedAmount > chunkSize * 4) {
        setTimeout(() => {
            dataChannel.send(packagedData);
            offset += chunkSize;
            processNextChunk();
        }, 10);
        return;
    }
    
    dataChannel.send(packagedData);
    offset += chunkSize;
    processNextChunk();
};
```

**Location**: `public/app.js:1165-1175`

**Buffer Threshold**: 4 × chunk size (1 MB)

---

### Memory Tracking

```javascript
// Line 977-980
performanceMetrics.filesInMemory = mySharedFiles.size;
performanceMetrics.memoryUsedMB = Array.from(mySharedFiles.values())
    .reduce((sum, f) => sum + f.size, 0) / (1024 * 1024);
```

**Location**: `public/app.js:977-980`

---

## 🔄 5. Complete Data Flow

### Download Process with OS Concepts

```
1. User clicks download
   ↓
2. addToQueue(file, priority)
   ├─ Create queue item
   ├─ Assign priority
   ├─ Set arrivalTime
   └─ Add to queue
   ↓
3. sortQueue() [Based on algorithm]
   ├─ FCFS: Sort by arrivalTime
   ├─ SJF: Sort by size
   └─ Priority: Sort by priority
   ↓
4. processNextInQueue()
   ├─ Check: semaphore.canAcquire()
   ├─ If YES: Continue
   └─ If NO: Wait
   ↓
5. semaphore.acquire()
   ├─ currentCount++
   └─ Start download
   ↓
6. startDownload(queueId)
   ├─ status = 'running'
   ├─ startTime = now
   └─ Calculate waitTime
   ↓
7. performDownload()
   ├─ WebRTC connection
   ├─ Receive chunks
   ├─ Decrypt chunks
   └─ Track progress
   ↓
8. completeDownload(queueId)
   ├─ status = 'completed'
   ├─ endTime = now
   ├─ Calculate turnaroundTime
   └─ Move to completedDownloads
   ↓
9. semaphore.release()
   ├─ currentCount--
   └─ processNextInQueue()
   ↓
10. updatePerformanceMetrics()
    ├─ Calculate averageWaitTime
    ├─ Calculate averageTurnaroundTime
    ├─ Calculate throughput
    └─ Update UI
```

---

## 📊 6. Performance Comparison

### Scheduling Algorithms Comparison

| Algorithm | Avg Wait Time | Avg Turnaround | Throughput | Starvation Risk |
|-----------|---------------|----------------|------------|-----------------|
| **FCFS**  | Medium        | Medium         | Medium     | None            |
| **SJF**   | Low           | Low            | High       | High (large)    |
| **Priority** | Varies     | Varies         | High       | High (low pri)  |

### Example Scenario

**Files in Queue:**
- File A: 100 MB, Priority 1, Arrived 10:00:00
- File B: 10 MB, Priority 5, Arrived 10:00:05
- File C: 50 MB, Priority 10, Arrived 10:00:10

**FCFS Order**: A → B → C
**SJF Order**: B → C → A
**Priority Order**: C → B → A

---

## 🎯 7. Key Takeaways

### OS Concepts Successfully Implemented

1. ✅ **CPU Scheduling**
   - FCFS, SJF, Priority algorithms
   - Queue management
   - State transitions

2. ✅ **Semaphore**
   - Resource synchronization
   - Concurrent download limiting
   - Critical section protection

3. ✅ **Performance Monitoring**
   - Wait time, turnaround time, response time
   - Throughput calculation
   - Resource utilization

4. ✅ **Memory Management**
   - Chunk-based transfer
   - Buffer management
   - Memory tracking

---

## 📝 Code Locations Summary

| Concept | File | Lines | Class/Function |
|---------|------|-------|----------------|
| Download Queue | `public/app.js` | 392-492 | `DownloadQueue` |
| FCFS Algorithm | `public/app.js` | 426-429 | `sortQueue()` |
| SJF Algorithm | `public/app.js` | 430-432 | `sortQueue()` |
| Priority Algorithm | `public/app.js` | 433-435 | `sortQueue()` |
| Semaphore | `public/app.js` | 495-528 | `Semaphore` |
| Acquire | `public/app.js` | 508-513 | `acquire()` |
| Release | `public/app.js` | 515-522 | `release()` |
| Performance Metrics | `public/app.js` | 534-571 | `performanceMetrics` |
| Update Metrics | `public/app.js` | 1626-1654 | `updatePerformanceMetrics()` |
| Buffer Management | `public/app.js` | 1165-1175 | `sendFile()` |

---

## 🎓 Educational Value

This project demonstrates:

1. **Practical OS Concepts** - Real-world application of theory
2. **Scheduling Algorithms** - Comparison and implementation
3. **Synchronization** - Semaphore for resource management
4. **Performance Analysis** - Metrics calculation and monitoring
5. **Memory Management** - Efficient buffer handling

Perfect for:
- Operating Systems course projects
- Understanding scheduling algorithms
- Learning synchronization primitives
- Performance monitoring implementation

---

*Last Updated: Today*  
*Status: Production Ready with OS Concepts*  
*Educational Level: Advanced*
