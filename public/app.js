// Socket.io connection
const socket = io();

// WebRTC configuration
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// State management
let myPeerId = null;
let mySharedFiles = new Map(); // Map to store files in memory
let availableFiles = [];
let peerConnections = new Map(); // Map of peer connections
let dataChannels = new Map(); // Map of data channels

// OS Concepts: Download Queue with Scheduling Algorithms
class DownloadQueue {
    constructor() {
        this.queue = [];
        this.activeDownloads = new Set();
        this.completedDownloads = [];
        this.schedulingAlgorithm = 'FCFS'; // FCFS, SJF, Priority
    }
    
    addToQueue(fileInfo, priority = 1) {
        const queueItem = {
            id: Date.now() + Math.random(),
            fileInfo: fileInfo,
            priority: priority,
            size: fileInfo.size,
            arrivalTime: Date.now(),
            startTime: null,
            endTime: null,
            status: 'waiting' // waiting, running, completed
        };
        
        // Priority items go first, then FCFS
        if (priority >= 10) {
            // Insert at front of queue
            this.queue.unshift(queueItem);
        } else {
            this.queue.push(queueItem);
        }
        
        this.updateQueueUI();
        return queueItem.id;
    }
    
    sortQueue() {
        switch(this.schedulingAlgorithm) {
            case 'FCFS': // First Come First Serve
                this.queue.sort((a, b) => a.arrivalTime - b.arrivalTime);
                break;
            case 'SJF': // Shortest Job First
                this.queue.sort((a, b) => a.size - b.size);
                break;
            case 'Priority': // Priority Scheduling
                this.queue.sort((a, b) => b.priority - a.priority);
                break;
        }
    }
    
    getNext() {
        return this.queue.find(item => item.status === 'waiting');
    }
    
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
    
    processNextInQueue() {
        console.log('processNextInQueue called', {
            canAcquire: semaphore.canAcquire(),
            currentCount: semaphore.currentCount,
            maxConcurrent: semaphore.maxConcurrent,
            queueLength: this.queue.length,
            waitingItems: this.queue.filter(q => q.status === 'waiting').length
        });
        
        if (semaphore.canAcquire() && this.queue.length > 0) {
            const next = this.getNext();
            if (next) {
                console.log('Starting next download:', next.fileInfo.name);
                semaphore.acquire();
                downloadFileFromQueue(next);
            } else {
                console.log('No waiting items in queue');
            }
        } else {
            console.log('Cannot process: semaphore full or queue empty');
        }
    }
    
    updateQueueUI() {
        renderTransferQueues();
        updatePerformanceMetrics();
    }
}

// OS Concepts: Semaphore for Connection Limiting
class Semaphore {
    constructor(maxConcurrent = 999999) {
        this.maxConcurrent = maxConcurrent;
        this.currentCount = 0;
        this.waiting = [];
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
        return this.currentCount > 0 ? ((this.currentCount / Math.min(this.maxConcurrent, 10)) * 100).toFixed(1) : '0';
    }
}

// Initialize OS components
const downloadQueue = new DownloadQueue();
const semaphore = new Semaphore(999999); // Unlimited concurrent downloads

// Performance Metrics - Application Level Monitoring
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

// Transfer history for recent transfers display
const transferHistory = [];

// DOM elements
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const myFilesList = document.getElementById('myFilesList');
const availableFilesList = document.getElementById('availableFiles');
const queueList1 = document.getElementById('queueList1');
const queueList2 = document.getElementById('queueList2');
const activeDownloadsList = document.getElementById('activeDownloadsList');
const activeUploadsList1 = document.getElementById('activeUploadsList1');
const activeUploadsList2 = document.getElementById('activeUploadsList2');
const miniSpeedGraph = document.getElementById('miniSpeedGraph');
const topSpeedValue = document.getElementById('topSpeedValue');

// Active transfers tracking
const activeTransfers = new Map(); // Map of transfer ID to transfer data

// Network speed graph data
const speedHistory = [];
const maxSpeedDataPoints = 30;
let speedGraphContext = null;

// Socket.io event listeners
socket.on('connect', () => {
    myPeerId = socket.id;
    const statusEl = document.getElementById('connectionStatus');
    const textEl = document.getElementById('connectionText');
    if (statusEl) statusEl.classList.add('connected');
    if (textEl) textEl.textContent = 'Connected';
    updateStatsDisplay();
});

socket.on('peers-list', (peers) => {
    const peerCountEl = document.getElementById('peerCount');
    if (peerCountEl) {
        peerCountEl.textContent = Math.max(0, peers.length - 1);
    }
});

socket.on('peer-joined', (peer) => {
    updatePeerCount(1);
});

socket.on('peer-left', (peer) => {
    updatePeerCount(-1);
    // Clean up connections
    if (peerConnections.has(peer.id)) {
        peerConnections.get(peer.id).close();
        peerConnections.delete(peer.id);
    }
    if (dataChannels.has(peer.id)) {
        dataChannels.delete(peer.id);
    }
});

socket.on('files-list', (files) => {
    availableFiles = files.filter(file => file.peerId !== myPeerId);
    renderAvailableFilesCompact();
});

socket.on('file-available', (file) => {
    if (file.peerId !== myPeerId) {
        availableFiles.push(file);
        renderAvailableFilesCompact();
    }
});

// WebRTC signaling
socket.on('offer', async ({ offer, fromPeerId }) => {
    const pc = createPeerConnection(fromPeerId);
    
    // Handle incoming data channel (when peer requests a file)
    pc.ondatachannel = (event) => {
        const dataChannel = event.channel;
        console.log('Data channel received from:', fromPeerId);
        
        dataChannel.onmessage = async (e) => {
            if (typeof e.data === 'string') {
                try {
                    const request = JSON.parse(e.data);
                    console.log('File request received:', request);
                    
                    if (request.type === 'request' && request.fileName) {
                        // Find the file in my shared files
                        const fileKey = Array.from(mySharedFiles.keys()).find(key => 
                            key.includes(request.fileName) || key.endsWith(request.fileName)
                        );
                        
                        if (fileKey) {
                            const file = mySharedFiles.get(fileKey);
                            console.log('Sending file:', file.name);
                            await sendFile(dataChannel, file);
                        } else {
                            console.error('File not found:', request.fileName);
                        }
                    }
                } catch (error) {
                    console.error('Error handling request:', error);
                }
            }
        };
    };
    
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    socket.emit('answer', {
        answer: answer,
        targetPeerId: fromPeerId
    });
});

socket.on('answer', async ({ answer, fromPeerId }) => {
    const pc = peerConnections.get(fromPeerId);
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('ice-candidate', async ({ candidate, fromPeerId }) => {
    const pc = peerConnections.get(fromPeerId);
    if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

// File upload handling
uploadArea.addEventListener('click', (e) => {
    // Prevent double-triggering from the button inside
    if (!e.target.closest('.btn-upload')) {
        fileInput.click();
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        shareFile(file);
    }
    fileInput.value = '';
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
    const file = e.dataTransfer.files[0];
    
    if (file) {
        if (file.size > MAX_FILE_SIZE) {
            showToast(`File too large: ${file.name}. Max size is 500 MB`, 'error');
            return;
        }
        shareFile(file);
    }
});

// Share file
function shareFile(file) {
    const fileId = `${myPeerId}-${Date.now()}-${file.name}`;
    
    // Store file in memory
    mySharedFiles.set(fileId, file);
    
    // Update memory metrics
    performanceMetrics.filesInMemory = mySharedFiles.size;
    performanceMetrics.memoryUsedMB = Array.from(mySharedFiles.values())
        .reduce((sum, f) => sum + f.size, 0) / (1024 * 1024);
    
    // Notify server
    socket.emit('share-file', {
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream'
    });
    
    renderMyFilesCompact();
    updatePerformanceMetrics();
}

// Create peer connection
function createPeerConnection(peerId) {
    if (peerConnections.has(peerId)) {
        return peerConnections.get(peerId);
    }
    
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.set(peerId, pc);
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                targetPeerId: peerId
            });
        }
    };
    
    // Handle data channel from remote peer
    pc.ondatachannel = (event) => {
        const dataChannel = event.channel;
        setupDataChannel(dataChannel, peerId, true);
    };
    
    return pc;
}

// Setup data channel
function setupDataChannel(dataChannel, peerId, isReceiver = false) {
    dataChannels.set(peerId, dataChannel);
    
    if (isReceiver) {
        let receivedBuffer = [];
        let receivedSize = 0;
        let totalSize = 0;
        let fileName = '';
        let startTime = 0;
        
        dataChannel.onmessage = (event) => {
            if (typeof event.data === 'string') {
                // Metadata message
                const metadata = JSON.parse(event.data);
                totalSize = metadata.size;
                fileName = metadata.name;
                startTime = Date.now();
            } else {
                // File chunk
                receivedBuffer.push(event.data);
                receivedSize += event.data.byteLength;
                
                if (receivedSize === totalSize) {
                    const blob = new Blob(receivedBuffer);
                    downloadBlob(blob, fileName);
                    receivedBuffer = [];
                    receivedSize = 0;
                }
            }
        };
    }
    
    dataChannel.onopen = () => {
        console.log('Data channel opened with', peerId);
    };
    
    dataChannel.onerror = (error) => {
        console.error('Data channel error:', error);
    };
}

// Download file from peer
window.downloadFile = (fileId, priority = 1) => {
    const file = availableFiles.find(f => f.id === fileId);
    if (!file) {
        showToast('File not found');
        return;
    }
    
    // Add to queue
    const queueId = downloadQueue.addToQueue(file, priority);
    
    // Try to start download if semaphore allows
    downloadQueue.processNextInQueue();
};

// Actual download function from queue
async function downloadFileFromQueue(queueItem) {
    try {
        downloadQueue.startDownload(queueItem.id);
        performanceMetrics.totalConnectionAttempts++;
        const connectionStartTime = Date.now();
        
        console.log('Starting download from queue:', queueItem.fileInfo.name);
        await performDownload(queueItem.fileInfo, queueItem.id, connectionStartTime);
    } catch (error) {
        console.error('Download failed:', error);
        performanceMetrics.failedTransfers++;
        showToast('Download failed: ' + error.message, 'error');
        downloadQueue.completeDownload(queueItem.id);
        semaphore.release();
    }
}

// Send file through data channel
async function sendFile(dataChannel, file) {
    const chunkSize = 16384; // 16KB chunks
    const totalSize = file.size;
    let offset = 0;
    let lastProgressTime = Date.now();
    let lastSentSize = 0;
    
    const startTime = Date.now();
    
    // Send metadata first
    dataChannel.send(JSON.stringify({
        name: file.name,
        size: file.size,
        type: file.type
    }));
    
    // Track buffer size
    performanceMetrics.bufferSizeMB = chunkSize / (1024 * 1024);
    
    // Send file in chunks
    const readChunk = () => {
        const slice = file.slice(offset, offset + chunkSize);
        const reader = new FileReader();
        
        reader.onload = (e) => {
            dataChannel.send(e.target.result);
            offset += chunkSize;
            
            // Calculate upload speed
            const now = Date.now();
            const timeDelta = (now - lastProgressTime) / 1000;
            if (timeDelta > 0.1) {
                const sizeDelta = offset - lastSentSize;
                const speedBytesPerSec = sizeDelta / timeDelta;
                performanceMetrics.currentUploadSpeed = speedBytesPerSec;
                lastProgressTime = now;
                lastSentSize = offset;
            }
            
            if (offset < totalSize) {
                readChunk();
            } else {
                performanceMetrics.totalUploads++;
                performanceMetrics.totalDataUploaded += totalSize;
                performanceMetrics.currentUploadSpeed = 0;
                
                // Add to transfer history
                const transferTime = (Date.now() - startTime) / 1000;
                transferHistory.unshift({
                    name: file.name,
                    size: totalSize,
                    time: transferTime,
                    speed: totalSize / transferTime,
                    type: 'upload',
                    timestamp: Date.now()
                });
                if (transferHistory.length > 10) transferHistory.pop();
                
                updatePerformanceMetrics();
            }
        };
        
        reader.readAsArrayBuffer(slice);
    };
    
    readChunk();
}

async function performDownload(fileInfo, queueId, connectionStartTime = Date.now()) {
    const peerId = fileInfo.peerId;
    const pc = createPeerConnection(peerId);
    
    // Create data channel
    const dataChannel = pc.createDataChannel('fileTransfer');
    
    let receivedBuffer = [];
    let receivedSize = 0;
    let totalSize = 0;
    let fileName = '';
    let startTime = 0;
    let firstChunkTime = 0;
    let lastProgressTime = Date.now();
    let lastReceivedSize = 0;
    const transferId = `download-${Date.now()}`;
    
    dataChannel.onopen = () => {
        console.log('Data channel opened, requesting file:', fileInfo.name);
        // Request the file
        dataChannel.send(JSON.stringify({
            type: 'request',
            fileId: fileInfo.id,
            fileName: fileInfo.name
        }));
    };
    
    dataChannel.onmessage = (event) => {
        if (typeof event.data === 'string') {
            const metadata = JSON.parse(event.data);
            totalSize = metadata.size;
            fileName = metadata.name;
            startTime = Date.now();
            firstChunkTime = 0;
            
            // Add to active transfers
            updateActiveTransfer(transferId, {
                id: transferId,
                name: fileName,
                type: 'download',
                progress: 0,
                speed: 0,
                transferred: 0,
                total: totalSize,
                peerId: peerId.substring(0, 8)
            });
            
            // Calculate connection time
            const connectionTime = startTime - connectionStartTime;
            const totalConnectionTime = performanceMetrics.averageConnectionTime * performanceMetrics.totalDownloads;
            performanceMetrics.averageConnectionTime = (totalConnectionTime + connectionTime) / (performanceMetrics.totalDownloads + 1);
        } else {
            if (firstChunkTime === 0) {
                firstChunkTime = Date.now();
                // Response time = time to first chunk
                const queueItem = downloadQueue.queue.find(q => q.id === queueId);
                if (queueItem) {
                    queueItem.responseTime = firstChunkTime - startTime;
                }
            }
            
            receivedBuffer.push(event.data);
            receivedSize += event.data.byteLength;
            
            // Calculate download speed
            const now = Date.now();
            const timeDelta = (now - lastProgressTime) / 1000; // seconds
            if (timeDelta > 0.1) { // Update every 100ms
                const sizeDelta = receivedSize - lastReceivedSize;
                const speedBytesPerSec = sizeDelta / timeDelta;
                performanceMetrics.currentDownloadSpeed = speedBytesPerSec;
                
                if (speedBytesPerSec > performanceMetrics.peakDownloadSpeed) {
                    performanceMetrics.peakDownloadSpeed = speedBytesPerSec;
                }
                
                // Update active transfer display
                const progress = (receivedSize / totalSize) * 100;
                updateActiveTransfer(transferId, {
                    progress: progress,
                    speed: speedBytesPerSec,
                    transferred: receivedSize
                });
                
                lastProgressTime = now;
                lastReceivedSize = receivedSize;
            }
            
            if (receivedSize === totalSize) {
                const blob = new Blob(receivedBuffer);
                downloadBlob(blob, fileName);
                
                // Remove from active transfers
                removeActiveTransfer(transferId);
                
                // Update metrics
                performanceMetrics.totalDownloads++;
                performanceMetrics.totalDataDownloaded += totalSize;
                performanceMetrics.currentDownloadSpeed = 0;
                
                // Add to transfer history
                const transferTime = (Date.now() - startTime) / 1000;
                transferHistory.unshift({
                    name: fileName,
                    size: totalSize,
                    time: transferTime,
                    speed: totalSize / transferTime,
                    type: 'download',
                    algorithm: downloadQueue.schedulingAlgorithm,
                    timestamp: Date.now()
                });
                if (transferHistory.length > 10) transferHistory.pop();
                
                receivedBuffer = [];
                receivedSize = 0;
                
                // Show toast
                showToast(`File received: ${fileName}`);
                
                // Complete download in queue and release semaphore
                downloadQueue.completeDownload(queueId);
                semaphore.release();
                
                updatePerformanceMetrics();
                updatePerformanceUI();
            }
        }
    };
    
    dataChannel.onerror = (error) => {
        console.error('Data channel error:', error);
        performanceMetrics.failedTransfers++;
        showToast('Download error: Connection failed', 'error');
        removeActiveTransfer(transferId);
        downloadQueue.completeDownload(queueId);
        semaphore.release();
        updatePerformanceMetrics();
        updatePerformanceUI();
    };
    
    dataChannel.onclose = () => {
        performanceMetrics.activeConnections = Math.max(0, performanceMetrics.activeConnections - 1);
        removeActiveTransfer(transferId);
        updatePerformanceMetrics();
        updatePerformanceUI();
    };
    
    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('offer', { offer: offer, targetPeerId: peerId });
}

// Download blob as file
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Progress UI
// Render functions
function renderMyFiles() {
    if (!myFilesList) return;
    
    if (mySharedFiles.size === 0) {
        myFilesList.innerHTML = '';
        return;
    }
    
    myFilesList.innerHTML = '';
    
    mySharedFiles.forEach((file, fileId) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-meta">${formatBytes(file.size)}</div>
            </div>
            <div class="file-actions">
                <button class="btn btn-danger" onclick="removeFile('${fileId}')">Remove</button>
            </div>
        `;
        myFilesList.appendChild(fileItem);
    });
}

function renderAvailableFiles() {
    if (!availableFilesList) return;
    
    if (availableFiles.length === 0) {
        availableFilesList.innerHTML = '<p class="empty-state">No files available. Wait for peers to share files...</p>';
        return;
    }
    
    availableFilesList.innerHTML = '';
    
    availableFiles.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-meta">${formatBytes(file.size)} • From peer: ${file.peerId.substring(0, 8)}</div>
            </div>
            <div class="file-actions">
                <select class="priority-select" id="priority-${file.id}">
                    <option value="1">Low Priority</option>
                    <option value="5" selected>Normal Priority</option>
                    <option value="10">High Priority</option>
                </select>
                <button class="btn btn-primary" onclick="downloadWithPriority('${file.id}')">Download</button>
            </div>
        `;
        availableFilesList.appendChild(fileItem);
    });
}

function renderDownloadQueue() {
    if (!queueList) return;
    
    if (downloadQueue.queue.length === 0 && downloadQueue.completedDownloads.length === 0) {
        queueList.innerHTML = '<p class="empty-state">Queue is empty</p>';
        return;
    }
    
    queueList.innerHTML = '';
    
    [...downloadQueue.queue, ...downloadQueue.completedDownloads.slice(-5)].forEach(item => {
        const queueItem = document.createElement('div');
        queueItem.className = `queue-item queue-${item.status}`;
        
        const waitTime = item.startTime ? item.startTime - item.arrivalTime : Date.now() - item.arrivalTime;
        const turnaroundTime = item.endTime ? item.endTime - item.arrivalTime : 0;
        
        // Icon based on status
        let icon = '⏳';
        if (item.status === 'running') icon = '⚡';
        if (item.status === 'completed') icon = '✅';
        
        queueItem.innerHTML = `
            <div class="queue-icon">${icon}</div>
            <div class="queue-info">
                <div class="queue-name">${item.fileInfo.name}</div>
                <div class="queue-meta">
                    ${formatBytes(item.size)} • Priority: ${item.priority} • ${item.status.toUpperCase()}
                    ${item.status === 'waiting' ? ` • Wait: ${(waitTime / 1000).toFixed(1)}s` : ''}
                    ${item.status === 'completed' ? ` • Turnaround: ${(turnaroundTime / 1000).toFixed(1)}s` : ''}
                </div>
            </div>
        `;
        queueList.appendChild(queueItem);
    });
}

function updatePerformanceMetrics() {
    const uptime = (Date.now() - performanceMetrics.startTime) / 1000;
    
    // Calculate scheduling metrics (OS Concepts)
    const completed = downloadQueue.completedDownloads;
    if (completed.length > 0) {
        const totalWait = completed.reduce((sum, item) => sum + (item.startTime - item.arrivalTime), 0);
        const totalTurnaround = completed.reduce((sum, item) => sum + (item.endTime - item.arrivalTime), 0);
        const totalResponse = completed.reduce((sum, item) => sum + (item.responseTime || 0), 0);
        
        performanceMetrics.averageWaitTime = totalWait / completed.length / 1000;
        performanceMetrics.averageTurnaroundTime = totalTurnaround / completed.length / 1000;
        performanceMetrics.averageResponseTime = totalResponse / completed.length / 1000;
        performanceMetrics.throughput = completed.length / uptime * 60;
    } else {
        // Calculate throughput for completed transfers in last minute
        const oneMinuteAgo = Date.now() - 60000;
        const recentCompleted = completed.filter(item => item.endTime > oneMinuteAgo);
        performanceMetrics.throughput = recentCompleted.length;
    }
    
    // Semaphore metrics
    performanceMetrics.resourceUtilization = parseFloat(semaphore.getUtilization());
    performanceMetrics.blockedRequests = downloadQueue.queue.filter(q => q.status === 'waiting').length;
    performanceMetrics.activeConnections = semaphore.currentCount;
    
    // Update UI
    updatePerformanceUI();
}

// Download with priority
window.downloadWithPriority = (fileId) => {
    const prioritySelect = document.getElementById(`priority-${fileId}`);
    const priority = prioritySelect ? parseInt(prioritySelect.value) : 5;
    downloadFile(fileId, priority);
};

// Change scheduling algorithm
window.changeSchedulingAlgorithm = () => {
    if (schedulingSelect) {
        downloadQueue.schedulingAlgorithm = schedulingSelect.value;
        downloadQueue.sortQueue();
        downloadQueue.updateQueueUI();
    }
};

// Change semaphore limit
window.changeSemaphoreLimit = () => {
    if (semaphoreLimit) {
        const newLimit = parseInt(semaphoreLimit.value);
        semaphore.maxConcurrent = newLimit;
        updatePerformanceMetrics();
    }
};

// Initialize performance monitoring
setInterval(() => {
    updatePerformanceMetrics();
    renderDownloadQueue();
    updateSpeedGraph();
}, 1000);

// Helper function for transfer history
function renderTransferHistory() {
    const historyEl = document.getElementById('transferHistory');
    if (!historyEl || transferHistory.length === 0) return;
    
    historyEl.innerHTML = transferHistory.map(transfer => {
        const icon = transfer.type === 'download' ? '📥' : '📤';
        const typeClass = transfer.type === 'download' ? 'download' : 'upload';
        const algorithm = transfer.algorithm ? ` (${transfer.algorithm})` : '';
        
        return `
            <div class="history-item ${typeClass}">
                <span class="history-icon">${icon}</span>
                <div class="history-info">
                    <div class="history-name">${transfer.name}</div>
                    <div class="history-meta">
                        ${formatBytes(transfer.size)} • 
                        ${transfer.time.toFixed(1)}s • 
                        ${formatSpeed(transfer.speed)}${algorithm}
                    </div>
                </div>
                <div class="history-status">✅</div>
            </div>
        `;
    }).join('');
}

// Render active transfers
function renderActiveTransfers() {
    if (!activeTransfersList) return;
    
    if (activeTransfers.size === 0) {
        activeTransfersList.innerHTML = '<p class="empty-state">No active transfers</p>';
        return;
    }
    
    activeTransfersList.innerHTML = Array.from(activeTransfers.values()).map(transfer => {
        const percentage = transfer.progress.toFixed(1);
        const speed = formatSpeed(transfer.speed);
        const transferred = formatBytes(transfer.transferred);
        const total = formatBytes(transfer.total);
        const typeClass = transfer.type === 'upload' ? 'upload' : '';
        
        return `
            <div class="transfer-item">
                <div class="transfer-header">
                    <div class="transfer-info">
                        <h4>${transfer.name}</h4>
                        <div class="transfer-peer">From: ${transfer.peerId || 'peer'}</div>
                    </div>
                    <div class="transfer-stats">
                        <div class="transfer-percentage">${percentage}%</div>
                        <div class="transfer-speed">${speed}</div>
                    </div>
                </div>
                <div class="transfer-progress">
                    <div class="transfer-progress-fill ${typeClass}" style="width: ${percentage}%"></div>
                </div>
                <div class="transfer-size">${transferred} / ${total}</div>
            </div>
        `;
    }).join('');
}

// Update active transfer
function updateActiveTransfer(transferId, data) {
    if (activeTransfers.has(transferId)) {
        const transfer = activeTransfers.get(transferId);
        Object.assign(transfer, data);
    } else {
        activeTransfers.set(transferId, data);
    }
    renderActiveDownloads();
    renderActiveUploads();
}

// Remove active transfer
function removeActiveTransfer(transferId) {
    activeTransfers.delete(transferId);
    renderActiveDownloads();
    renderActiveUploads();
}

// Initialize speed graph
function initSpeedGraph() {
    if (!speedGraph) return;
    
    // Set canvas size to match display size
    const rect = speedGraph.getBoundingClientRect();
    speedGraph.width = rect.width || 300;
    speedGraph.height = 120;
    
    speedGraphContext = speedGraph.getContext('2d');
    drawSpeedGraph();
}

// Update speed graph
function updateSpeedGraph() {
    const currentSpeed = (performanceMetrics.currentDownloadSpeed + performanceMetrics.currentUploadSpeed) / (1024 * 1024); // MB/s
    
    speedHistory.push(currentSpeed);
    if (speedHistory.length > maxSpeedDataPoints) {
        speedHistory.shift();
    }
    
    // Update current speed display
    const currentSpeedEl = document.getElementById('currentSpeed');
    if (currentSpeedEl) {
        currentSpeedEl.textContent = `${currentSpeed.toFixed(2)} MB/s`;
    }
    
    drawSpeedGraph();
}

// Draw speed graph on canvas
function drawSpeedGraph() {
    if (!speedGraphContext || !speedGraph) return;
    
    const ctx = speedGraphContext;
    const width = speedGraph.width;
    const height = speedGraph.height;
    const padding = 10;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Find max speed for scaling
    const maxSpeed = Math.max(...speedHistory, 1);
    
    // Draw grid lines
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (height - 2 * padding) * (i / 4);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    // Draw speed line
    if (speedHistory.length > 1) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        speedHistory.forEach((speed, index) => {
            const x = padding + ((width - 2 * padding) / maxSpeedDataPoints) * index;
            const y = height - padding - ((height - 2 * padding) * (speed / maxSpeed));
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Fill area under curve
        ctx.lineTo(width - padding, height - padding);
        ctx.lineTo(padding, height - padding);
        ctx.closePath();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
        ctx.fill();
    }
}

// Update performance UI elements
function updatePerformanceUI() {
    // Update connection stat
    const connectionStatEl = document.getElementById('connectionStat');
    if (connectionStatEl) {
        connectionStatEl.textContent = `${semaphore.currentCount}/${semaphore.maxConcurrent}`;
    }
    
    // Update metrics
    const avgQueueTimeEl = document.getElementById('avgQueueTime');
    if (avgQueueTimeEl) {
        avgQueueTimeEl.textContent = `${performanceMetrics.averageWaitTime.toFixed(1)}s`;
    }
    
    const queueWaitingEl = document.getElementById('queueWaiting');
    if (queueWaitingEl) {
        queueWaitingEl.textContent = downloadQueue.queue.filter(q => q.status === 'waiting').length;
    }
    
    const completedTodayEl = document.getElementById('completedToday');
    if (completedTodayEl) {
        completedTodayEl.textContent = performanceMetrics.totalDownloads;
    }
    
    const failedTransfersEl = document.getElementById('failedTransfers');
    if (failedTransfersEl) {
        failedTransfersEl.textContent = performanceMetrics.failedTransfers;
    }
    
    const topSpeedEl = document.getElementById('topSpeedValue');
    if (topSpeedEl) {
        topSpeedEl.textContent = `${(performanceMetrics.peakDownloadSpeed / (1024 * 1024)).toFixed(2)} MB/s`;
    }
    
    // Update stats display
    updateStatsDisplay();
}

// Update stats display in hero section
function updateStatsDisplay() {
    const totalDownloadsEl = document.getElementById('totalDownloads');
    const totalUploadsEl = document.getElementById('totalUploads');
    const currentSpeedEl = document.getElementById('currentSpeedStat');
    const activeConnectionsEl = document.getElementById('activeConnections');
    
    if (totalDownloadsEl) totalDownloadsEl.textContent = performanceMetrics.totalDownloads;
    if (totalUploadsEl) totalUploadsEl.textContent = performanceMetrics.totalUploads;
    if (currentSpeedEl) {
        const speed = (performanceMetrics.currentDownloadSpeed + performanceMetrics.currentUploadSpeed) / (1024 * 1024);
        currentSpeedEl.textContent = `${speed.toFixed(2)} MB/s`;
    }
    if (activeConnectionsEl) {
        activeConnectionsEl.textContent = semaphore.currentCount;
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const messageEl = toast?.querySelector('.toast-message');
    if (toast && messageEl) {
        messageEl.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initMiniSpeedGraph();
    renderAllUI();
    
    // Update speed graph every second
    setInterval(() => {
        updateMiniSpeedGraph();
    }, 1000);
    
    // Update performance metrics every 2 seconds
    setInterval(() => {
        updatePerformanceMetrics();
        updateConnectionProgress();
    }, 2000);
    
    // Re-render UI when transfers update
    setInterval(() => {
        renderActiveDownloads();
        renderActiveUploads();
    }, 500);
});

// Helper function to format speed
function formatSpeed(bytesPerSecond) {
    if (bytesPerSecond === 0) return '0 KB/s';
    const kbps = bytesPerSecond / 1024;
    if (kbps < 1024) {
        return `${kbps.toFixed(1)} KB/s`;
    }
    return `${(kbps / 1024).toFixed(2)} MB/s`;
}

// Remove file
window.removeFile = (fileId) => {
    mySharedFiles.delete(fileId);
    renderMyFilesCompact();
    socket.emit('file-removed', fileId);
};

// Helper functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function updatePeerCount(delta) {
    const countEl = document.getElementById('peerCount');
    const current = parseInt(countEl.textContent);
    countEl.textContent = Math.max(0, current + delta);
}

// ===== NEW RENDER FUNCTIONS FOR TOP CARDS LAYOUT =====

// Render active downloads in top card
function renderActiveDownloads() {
    const section = document.getElementById('activeTransfersSection');
    const listEl = document.querySelector('#activeDownloadsList .transfer-list');
    if (!listEl) return;
    
    const downloads = Array.from(activeTransfers.values()).filter(t => t.type === 'download');
    
    // Show/hide section based on active transfers
    if (section) {
        section.style.display = (downloads.length > 0 || Array.from(activeTransfers.values()).filter(t => t.type === 'upload').length > 0) ? 'block' : 'none';
    }
    
    if (downloads.length === 0) {
        listEl.innerHTML = '';
        return;
    }
    
    listEl.innerHTML = downloads.map(transfer => `
        <div class="transfer-item">
            <div class="transfer-header">
                <div class="transfer-info">
                    <h4>${transfer.name}</h4>
                    <div class="transfer-peer">From: ${transfer.peerId}</div>
                </div>
                <div class="transfer-stats">
                    <div class="transfer-percentage">${transfer.progress.toFixed(0)}%</div>
                    <div class="transfer-speed">${formatSpeed(transfer.speed)}</div>
                </div>
            </div>
            <div class="transfer-progress">
                <div class="transfer-progress-fill" style="width: ${transfer.progress}%"></div>
            </div>
            <div class="transfer-size">${formatBytes(transfer.transferred)} / ${formatBytes(transfer.total)}</div>
        </div>
    `).join('');
}

// Render active uploads in top cards
function renderActiveUploads() {
    const listEl = document.querySelector('#activeUploadsList1 .transfer-list');
    if (!listEl) return;
    
    const uploads = Array.from(activeTransfers.values()).filter(t => t.type === 'upload');
    
    if (uploads.length === 0) {
        listEl.innerHTML = '';
        return;
    }
    
    listEl.innerHTML = uploads.map(transfer => `
        <div class="transfer-item">
            <div class="transfer-header">
                <div class="transfer-info">
                    <h4>${transfer.name}</h4>
                    <div class="transfer-peer">To: ${transfer.peerId}</div>
                </div>
                <div class="transfer-stats">
                    <div class="transfer-percentage">${transfer.progress.toFixed(0)}%</div>
                    <div class="transfer-speed">${formatSpeed(transfer.speed)}</div>
                </div>
            </div>
            <div class="transfer-progress">
                <div class="transfer-progress-fill upload" style="width: ${transfer.progress}%"></div>
            </div>
            <div class="transfer-size">${formatBytes(transfer.transferred)} / ${formatBytes(transfer.total)}</div>
        </div>
    `).join('');
}

// Initialize and draw mini speed graph
let miniSpeedGraphContext = null;

function initMiniSpeedGraph() {
    if (!miniSpeedGraph) return;
    miniSpeedGraphContext = miniSpeedGraph.getContext('2d');
    drawMiniSpeedGraph();
}

function drawMiniSpeedGraph() {
    if (!miniSpeedGraphContext || !miniSpeedGraph) return;
    
    const ctx = miniSpeedGraphContext;
    const width = miniSpeedGraph.width;
    const height = miniSpeedGraph.height;
    const padding = 10;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Prepare data (last 20 points for smoother line)
    const dataPoints = speedHistory.slice(-20);
    if (dataPoints.length < 2) {
        return;
    }
    
    const maxSpeed = Math.max(...dataPoints, 0.1);
    const stepX = (width - padding * 2) / (dataPoints.length - 1);
    
    // Draw grid lines (horizontal)
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
        const y = padding + (i * (height - padding * 2) / 3);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    // Draw area fill under line
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    
    dataPoints.forEach((speed, index) => {
        const x = padding + index * stepX;
        const y = height - padding - (speed / maxSpeed) * (height - padding * 2);
        
        if (index === 0) {
            ctx.lineTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.lineTo(width - padding, height - padding);
    ctx.closePath();
    
    // Gradient fill
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.3)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.05)');
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Draw line
    ctx.beginPath();
    dataPoints.forEach((speed, index) => {
        const x = padding + index * stepX;
        const y = height - padding - (speed / maxSpeed) * (height - padding * 2);
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    // Draw dots on data points (every 3rd point for cleaner look)
    dataPoints.forEach((speed, index) => {
        if (index % 3 === 0 || index === dataPoints.length - 1) {
            const x = padding + index * stepX;
            const y = height - padding - (speed / maxSpeed) * (height - padding * 2);
            
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#06b6d4';
            ctx.fill();
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });
}

function updateMiniSpeedGraph() {
    const currentSpeed = (performanceMetrics.currentDownloadSpeed + performanceMetrics.currentUploadSpeed) / (1024 * 1024);
    
    speedHistory.push(currentSpeed);
    if (speedHistory.length > 30) {
        speedHistory.shift();
    }
    
    // Update top speed display
    if (topSpeedValue) {
        topSpeedValue.textContent = `${currentSpeed.toFixed(1)} MB/s`;
    }
    
    drawMiniSpeedGraph();
}

// Render my shared files in compact format
function renderMyFilesCompact() {
    if (!myFilesList) return;
    
    if (mySharedFiles.size === 0) {
        myFilesList.innerHTML = '<div class="empty-state-container"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p class="empty-state-text">No shared files</p><p class="empty-state-subtext">Upload files to share with peers</p></div>';
        return;
    }
    
    myFilesList.innerHTML = Array.from(mySharedFiles.entries()).map(([fileId, file]) => `
        <div class="file-item-compact">
            <div class="file-item-left">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                </svg>
                <div class="file-item-info">
                    <div class="file-item-name">${file.name}</div>
                    <div class="file-item-meta">${formatBytes(file.size)}</div>
                </div>
            </div>
            <button class="btn-danger" onclick="removeFile('${fileId}')">Remove</button>
        </div>
    `).join('');
}

// Render available files in compact format
function renderAvailableFilesCompact() {
    if (!availableFilesList) return;
    
    if (availableFiles.length === 0) {
        availableFilesList.innerHTML = '<div class="empty-state-container"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p class="empty-state-text">No files available</p><p class="empty-state-subtext">Waiting for peers to share files</p></div>';
        return;
    }
    
    availableFilesList.innerHTML = availableFiles.map(file => {
        const peerId = file.peerId ? file.peerId.substring(0, 8) : 'unknown';
        return `
        <div class="file-item-compact">
            <div class="file-item-left">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                </svg>
                <div class="file-item-info">
                    <div class="file-item-name">
                        ${file.priority ? '<span class="priority-badge">⚡ [Priority]</span> ' : ''}
                        ${file.name}
                    </div>
                    <div class="file-item-meta">${formatBytes(file.size)} • From: ${peerId}</div>
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button 
                    class="btn-download" 
                    onclick='window.downloadFileWithPriority(${JSON.stringify(file)}, 0)'
                >
                    Download
                </button>
                <button 
                    class="btn-priority" 
                    onclick='window.downloadFileWithPriority(${JSON.stringify(file)}, 10)'
                    title="Priority Download - Skip Queue"
                >
                    ⚡
                </button>
            </div>
        </div>
    `}).join('');
}

// Render transfer queues
function renderTransferQueues() {
    const queueSection = document.getElementById('queueSection');
    if (queueSection) {
        queueSection.style.display = downloadQueue.queue.length > 0 ? 'block' : 'none';
    }
    
    // Split queue items between two columns
    const queueItems = downloadQueue.queue;
    const halfPoint = Math.ceil(queueItems.length / 2);
    
    // Queue 1
    if (queueList1) {
        const queue1Items = queueItems.slice(0, halfPoint);
        if (queue1Items.length === 0) {
            queueList1.innerHTML = '<p class="empty-state">Queue is empty</p>';
        } else {
            queueList1.innerHTML = queue1Items.map((item, index) => {
                const queueNumber = index + 1;
                const priorityIcon = item.priority >= 10 ? '⚡' : '';
                const waitTime = ((Date.now() - item.arrivalTime) / 1000).toFixed(1);
                
                return `
                <div class="queue-item-compact ${item.status === 'running' ? 'queue-running' : ''}">
                    <div class="queue-number">${queueNumber}</div>
                    <div class="file-item-left">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                        </svg>
                        <div class="file-item-info">
                            <div class="file-item-name">
                                ${priorityIcon} ${item.fileInfo.name}
                            </div>
                            <div class="file-item-meta">(${formatBytes(item.size)}) • Wait: ${waitTime}s</div>
                        </div>
                    </div>
                    <div class="queue-item-actions">
                        <button onclick="removeFromQueue('${item.id}')">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `}).join('');
        }
    }
    
    // Queue 2
    if (queueList2) {
        const queue2Items = queueItems.slice(halfPoint);
        if (queue2Items.length === 0) {
            queueList2.innerHTML = '<p class="empty-state">Queue is empty</p>';
        } else {
            queueList2.innerHTML = queue2Items.map((item, index) => {
                const queueNumber = halfPoint + index + 1;
                const priorityIcon = item.priority >= 10 ? '⚡' : '';
                const waitTime = ((Date.now() - item.arrivalTime) / 1000).toFixed(1);
                
                return `
                <div class="queue-item-compact ${item.status === 'running' ? 'queue-running' : ''}">
                    <div class="queue-number">${queueNumber}</div>
                    <div class="file-item-left">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                        </svg>
                        <div class="file-item-info">
                            <div class="file-item-name">
                                ${priorityIcon} ${item.fileInfo.name}
                            </div>
                            <div class="file-item-meta">Wait: ${waitTime}s</div>
                        </div>
                    </div>
                    <button class="btn-download" onclick="removeFromQueue('${item.id}')">Remove</button>
                </div>
            `}).join('');
        }
    }
}

// Update connection progress bar
function updateConnectionProgress() {
    const progressEl = document.getElementById('connectionProgress');
    const connectionStatEl = document.getElementById('connectionStat');
    
    if (progressEl) {
        // Show progress based on actual connections, capped at visual limit
        const visualMax = 10;
        const percentage = Math.min((semaphore.currentCount / visualMax) * 100, 100);
        progressEl.style.width = `${percentage}%`;
    }
    
    if (connectionStatEl) {
        connectionStatEl.textContent = `${semaphore.currentCount} Active`;
    }
}

// Master render function - update all UI components
function renderAllUI() {
    renderActiveDownloads();
    renderActiveUploads();
    renderMyFilesCompact();
    renderAvailableFilesCompact();
    renderTransferQueues();
    updateConnectionProgress();
}

window.removeFromQueue = (itemId) => {
    downloadQueue.queue = downloadQueue.queue.filter(q => q.id !== itemId);
    renderTransferQueues();
};

window.downloadFileWithPriority = (fileInfo, priority) => {
    console.log('downloadFileWithPriority called:', fileInfo.name, 'priority:', priority);
    
    // Use the proper DownloadQueue method
    const queueId = downloadQueue.addToQueue(fileInfo, priority);
    
    if (priority >= 10) {
        showToast('Priority download queued - jumping to front!');
    } else {
        showToast('Download added to queue');
    }
    
    // Process the queue to start download if semaphore allows
    downloadQueue.processNextInQueue();
};

