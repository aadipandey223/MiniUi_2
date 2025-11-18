# Operating System Concepts Implementation

This document explains the OS concepts implemented in the P2P File Sharing application.

---

## 🎯 Implemented OS Concepts

### 1. **CPU Scheduling Algorithms**

The application implements three classic CPU scheduling algorithms for managing download queues:

#### **FCFS (First Come First Serve)**
- Downloads are processed in the order they arrive
- Simple and fair for all processes
- May lead to convoy effect with large files

**Implementation:**
```javascript
case 'FCFS':
    this.queue.sort((a, b) => a.arrivalTime - b.arrivalTime);
    break;
```

#### **SJF (Shortest Job First)**
- Prioritizes smallest files first
- Minimizes average waiting time
- Optimal for throughput

**Implementation:**
```javascript
case 'SJF':
    this.queue.sort((a, b) => a.size - b.size);
    break;
```

#### **Priority Scheduling**
- User assigns priority to each download (1-10)
- Higher priority downloads execute first
- Allows critical files to jump the queue

**Implementation:**
```javascript
case 'Priority':
    this.queue.sort((a, b) => b.priority - a.priority);
    break;
```

---

### 2. **Semaphore for Resource Management**

Implements a counting semaphore to limit concurrent downloads (resource management).

**Key Features:**
- Controls access to limited resources (network bandwidth, connections)
- Prevents system overload
- Configurable limit (1-5 concurrent downloads)

**Implementation:**
```javascript
class Semaphore {
    constructor(maxConcurrent = 3) {
        this.maxConcurrent = maxConcurrent;
        this.currentCount = 0;
    }
    
    acquire() {
        if (this.canAcquire()) {
            this.currentCount++;
            return true;
        }
        return false;
    }
    
    release() {
        if (this.currentCount > 0) {
            this.currentCount--;
            downloadQueue.processNextInQueue();
        }
    }
}
```

**Real-world analogy:** Like a parking lot with limited spaces - only N downloads can run simultaneously.

---

### 3. **Performance Monitoring Dashboard**

Real-time metrics similar to OS task managers:

#### **Metrics Displayed:**

1. **Resource Utilization** - Percentage of semaphore resources in use
   ```
   Utilization = (Active Downloads / Max Concurrent) × 100%
   ```

2. **Queue Size** - Number of downloads waiting

3. **Average Wait Time** - Time from queue entry to download start
   ```
   Wait Time = Start Time - Arrival Time
   ```

4. **Average Turnaround Time** - Total time from request to completion
   ```
   Turnaround Time = End Time - Arrival Time
   ```

5. **Throughput** - Downloads completed per minute
   ```
   Throughput = Completed Downloads / Uptime (in minutes)
   ```

6. **Total Downloads/Uploads** - System activity counters

---

## 🔬 How to Test OS Features

### **Test Scenario 1: Scheduling Algorithms**

1. Open app in 2 tabs
2. Share 3-5 files of different sizes from Tab 1
3. In Tab 2:
   - Select **SJF** algorithm
   - Queue all files for download
   - Observe: Smallest files download first
   
4. Change to **FCFS**:
   - Clear queue
   - Queue files again in random order
   - Observe: First-queued downloads first

5. Use **Priority Scheduling**:
   - Set different priorities (Low/Normal/High)
   - Observe: High priority files jump ahead

### **Test Scenario 2: Semaphore Limiting**

1. Set **Max Concurrent Downloads** to 1
2. Queue multiple files
3. Observe: Only 1 download runs at a time (sequential)

4. Change to 3 concurrent downloads
5. Observe: Up to 3 downloads run simultaneously

6. Monitor **Resource Utilization** percentage

### **Test Scenario 3: Performance Metrics**

1. Queue 5+ files
2. Watch the dashboard update in real-time:
   - Wait times increase for queued files
   - Throughput increases as downloads complete
   - Turnaround time shows total processing time

---

## 📊 OS Concepts Comparison

| Concept | Traditional OS | Our P2P App |
|---------|---------------|-------------|
| **Process** | Running program | File download |
| **CPU** | Processing unit | Network bandwidth |
| **Scheduler** | OS kernel | Download queue manager |
| **Semaphore** | Thread synchronization | Connection limiting |
| **PCB (Process Control Block)** | Process metadata | Queue item metadata |
| **Context Switch** | Save/restore process state | Start next download |

---

## 🎓 For Your OS Project Report

### **Key Points to Highlight:**

1. **Practical Implementation:**
   - Real-world application of scheduling algorithms
   - Demonstrates when each algorithm performs best

2. **Resource Management:**
   - Semaphore prevents resource starvation
   - Configurable limits show trade-offs

3. **Performance Analysis:**
   - Metrics prove SJF minimizes wait time
   - Shows convoy effect in FCFS
   - Demonstrates priority inversion

4. **Distributed Systems:**
   - P2P architecture (no central server for files)
   - WebRTC for direct peer communication
   - Signaling server for coordination

### **Diagrams to Include:**

1. **System Architecture:**
   ```
   Peer A ←→ Signaling Server ←→ Peer B
      ↓                              ↓
      └──── Direct P2P Connection ───┘
   ```

2. **Download Queue State Machine:**
   ```
   WAITING → (Semaphore Acquire) → RUNNING → COMPLETED
   ```

3. **Scheduling Comparison Chart:**
   - Plot wait times vs file sizes for each algorithm

---

## 🚀 Advanced Features You Can Add

1. **Round Robin Scheduling** - Time slices for fair sharing
2. **Multilevel Queue** - Different queues for different file types
3. **Deadlock Detection** - Handle peer disconnections
4. **Memory Management** - Limit total memory for file buffers
5. **Page Replacement** - Cache popular files using LRU/FIFO

---

## 📝 Testing Checklist

- [ ] FCFS maintains arrival order
- [ ] SJF prioritizes small files
- [ ] Priority scheduling respects user priorities
- [ ] Semaphore blocks when limit reached
- [ ] Metrics update in real-time
- [ ] Queue visualization shows status
- [ ] Resource utilization accurate
- [ ] Turnaround time calculated correctly

---

## 🎯 Conclusion

This implementation demonstrates core OS concepts in a practical, visual way:
- **Scheduling** optimizes download order
- **Semaphores** manage limited resources
- **Metrics** prove algorithm effectiveness
- **P2P architecture** shows distributed systems

Perfect for demonstrating OS theory in a real-world application! 🎉
