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

// DOM elements
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const myFilesList = document.getElementById('myFilesList');
const availableFilesList = document.getElementById('availableFiles');
const progressModal = document.getElementById('progressModal');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressSpeed = document.getElementById('progressSpeed');
const progressTitle = document.getElementById('progressTitle');

// Socket.io event listeners
socket.on('connect', () => {
    myPeerId = socket.id;
    document.getElementById('peerId').textContent = myPeerId.substring(0, 8);
    document.getElementById('connectionStatus').classList.add('connected');
    document.getElementById('connectionText').textContent = 'Connected';
});

socket.on('peers-list', (peers) => {
    document.getElementById('peerCount').textContent = peers.length - 1;
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
    renderAvailableFiles();
});

socket.on('file-available', (file) => {
    if (file.peerId !== myPeerId) {
        availableFiles.push(file);
        renderAvailableFiles();
    }
});

// WebRTC signaling
socket.on('offer', async ({ offer, fromPeerId }) => {
    const pc = createPeerConnection(fromPeerId);
    
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
uploadArea.addEventListener('click', () => {
    fileInput.click();
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
    
    const file = e.dataTransfer.files[0];
    if (file) {
        shareFile(file);
    }
});

// Share file
function shareFile(file) {
    const fileId = `${myPeerId}-${Date.now()}-${file.name}`;
    
    // Store file in memory
    mySharedFiles.set(fileId, file);
    
    // Notify server
    socket.emit('share-file', {
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream'
    });
    
    renderMyFiles();
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
                
                progressTitle.textContent = `Receiving: ${fileName}`;
                showProgress();
            } else {
                // File chunk
                receivedBuffer.push(event.data);
                receivedSize += event.data.byteLength;
                
                const progress = (receivedSize / totalSize) * 100;
                updateProgress(progress, receivedSize, totalSize, startTime);
                
                if (receivedSize === totalSize) {
                    const blob = new Blob(receivedBuffer);
                    downloadBlob(blob, fileName);
                    receivedBuffer = [];
                    receivedSize = 0;
                    hideProgress();
                }
            }
        };
    }
    
    dataChannel.onopen = () => {
        console.log('Data channel opened with', peerId);
    };
    
    dataChannel.onerror = (error) => {
        console.error('Data channel error:', error);
        hideProgress();
    };
}

// Download file from peer
async function downloadFile(fileInfo) {
    const peerId = fileInfo.peerId;
    
    // Create peer connection if not exists
    const pc = createPeerConnection(peerId);
    
    // Create data channel
    const dataChannel = pc.createDataChannel('fileTransfer');
    setupDataChannel(dataChannel, peerId, false);
    
    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('offer', {
        offer: offer,
        targetPeerId: peerId
    });
    
    // Wait for data channel to open, then request file
    dataChannel.onopen = () => {
        // Find the actual file from my shared files
        const fileKey = Array.from(mySharedFiles.keys()).find(key => 
            key.includes(fileInfo.name)
        );
        
        // In a real scenario, the receiver would send a request
        // For now, if we're the sender, we send immediately when channel opens
    };
}

// Send file through data channel
async function sendFile(dataChannel, file) {
    const chunkSize = 16384; // 16KB chunks
    const totalSize = file.size;
    let offset = 0;
    
    progressTitle.textContent = `Sending: ${file.name}`;
    showProgress();
    
    const startTime = Date.now();
    
    // Send metadata first
    dataChannel.send(JSON.stringify({
        name: file.name,
        size: file.size,
        type: file.type
    }));
    
    // Send file in chunks
    const readChunk = () => {
        const slice = file.slice(offset, offset + chunkSize);
        const reader = new FileReader();
        
        reader.onload = (e) => {
            dataChannel.send(e.target.result);
            offset += chunkSize;
            
            const progress = (offset / totalSize) * 100;
            updateProgress(progress, offset, totalSize, startTime);
            
            if (offset < totalSize) {
                readChunk();
            } else {
                hideProgress();
            }
        };
        
        reader.readAsArrayBuffer(slice);
    };
    
    readChunk();
}

// Handle download button click
window.downloadFile = async (fileId) => {
    const fileInfo = availableFiles.find(f => f.id === fileId);
    if (!fileInfo) return;
    
    const peerId = fileInfo.peerId;
    const pc = createPeerConnection(peerId);
    
    // Create data channel
    const dataChannel = pc.createDataChannel('fileTransfer');
    
    let receivedBuffer = [];
    let receivedSize = 0;
    let totalSize = 0;
    let fileName = '';
    let startTime = 0;
    
    dataChannel.onmessage = (event) => {
        if (typeof event.data === 'string') {
            const metadata = JSON.parse(event.data);
            totalSize = metadata.size;
            fileName = metadata.name;
            startTime = Date.now();
            progressTitle.textContent = `Receiving: ${fileName}`;
            showProgress();
        } else {
            receivedBuffer.push(event.data);
            receivedSize += event.data.byteLength;
            
            const progress = (receivedSize / totalSize) * 100;
            updateProgress(progress, receivedSize, totalSize, startTime);
            
            if (receivedSize === totalSize) {
                const blob = new Blob(receivedBuffer);
                downloadBlob(blob, fileName);
                receivedBuffer = [];
                receivedSize = 0;
                hideProgress();
            }
        }
    };
    
    dataChannel.onopen = () => {
        dataChannel.send(JSON.stringify({ requestFile: fileInfo.name }));
    };
    
    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('offer', { offer: offer, targetPeerId: peerId });
};

// Listen for file requests and send files
function setupFileSharing() {
    socket.on('offer', async ({ offer, fromPeerId }) => {
        const pc = createPeerConnection(fromPeerId);
        
        pc.ondatachannel = (event) => {
            const dataChannel = event.channel;
            
            dataChannel.onmessage = async (e) => {
                if (typeof e.data === 'string') {
                    const request = JSON.parse(e.data);
                    if (request.requestFile) {
                        // Find and send the requested file
                        const fileKey = Array.from(mySharedFiles.keys()).find(key => 
                            key.includes(request.requestFile)
                        );
                        
                        if (fileKey) {
                            const file = mySharedFiles.get(fileKey);
                            await sendFile(dataChannel, file);
                        }
                    }
                }
            };
        };
        
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('answer', { answer: answer, targetPeerId: fromPeerId });
    });
}

setupFileSharing();

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
function showProgress() {
    progressModal.classList.add('active');
}

function hideProgress() {
    setTimeout(() => {
        progressModal.classList.remove('active');
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
    }, 1000);
}

function updateProgress(percentage, current, total, startTime) {
    progressFill.style.width = `${percentage}%`;
    progressText.textContent = `${percentage.toFixed(1)}%`;
    
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = current / elapsed / 1024 / 1024;
    progressSpeed.textContent = `${formatBytes(current)} / ${formatBytes(total)} - ${speed.toFixed(2)} MB/s`;
}

// Render functions
function renderMyFiles() {
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
    if (availableFiles.length === 0) {
        availableFilesList.innerHTML = '<p class="empty-message">No files available. Wait for peers to share files...</p>';
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
                <button class="btn btn-primary" onclick="downloadFile('${file.id}')">Download</button>
            </div>
        `;
        availableFilesList.appendChild(fileItem);
    });
}

// Remove file
window.removeFile = (fileId) => {
    mySharedFiles.delete(fileId);
    renderMyFiles();
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
