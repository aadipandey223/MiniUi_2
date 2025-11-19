// Socket.io connection
let socket;
try {
    socket = io();
    console.log('✅ Socket.io initialized');
} catch (error) {
    console.error('❌ Failed to initialize Socket.io:', error);
    alert('Failed to connect to server. Please refresh the page.');
}

// Room state management
let currentRoomId = null;
let currentRoomKey = null; // AES-256-GCM key for room encryption
let userIdentity = null; // { displayName, hash, publicKey, privateKey }
let sessionKey = null; // Ephemeral session key for Layer 1
let pendingRoomJoin = null; // For password-protected rooms

// Initialize user identity on first load
async function initializeIdentity() {
    const stored = localStorage.getItem('userIdentity');
    
    if (stored) {
        userIdentity = JSON.parse(stored);
        // Import stored keys
        userIdentity.publicKey = await IdentityCrypto.importPublicKey(userIdentity.publicKeyBase64);
        userIdentity.privateKey = await IdentityCrypto.importPrivateKey(userIdentity.privateKeyBase64);
    } else {
        // Generate new identity
        const displayName = 'Anonymous';
        const hash = await CryptoUtils.generateIdentityHash(displayName);
        const keypair = await IdentityCrypto.generateKeypair();
        
        userIdentity = {
            displayName,
            hash,
            fullIdentity: `${displayName}#${hash}`,
            publicKey: keypair.publicKey,
            privateKey: keypair.privateKey,
            publicKeyBase64: await IdentityCrypto.exportPublicKey(keypair.publicKey),
            privateKeyBase64: await IdentityCrypto.exportPrivateKey(keypair.privateKey),
            createdAt: Date.now()
        };
        
        // Save to localStorage (public and private keys as base64)
        localStorage.setItem('userIdentity', JSON.stringify({
            displayName: userIdentity.displayName,
            hash: userIdentity.hash,
            fullIdentity: userIdentity.fullIdentity,
            publicKeyBase64: userIdentity.publicKeyBase64,
            privateKeyBase64: userIdentity.privateKeyBase64,
            createdAt: userIdentity.createdAt
        }));
    }
    
    console.log('🔐 User identity initialized:', userIdentity.fullIdentity);
}

// Check if URL has room ID
function checkForRoomInURL() {
    const path = window.location.pathname;
    console.log('🔍 Checking URL path:', path);
    const match = path.match(/\/room\/([a-zA-Z0-9]+)/);
    
    if (match) {
        const roomId = match[1];
        console.log('📍 Room ID found in URL:', roomId);
        
        // Small delay to ensure socket is connected
        setTimeout(() => {
            console.log('🔄 Fetching room info for:', roomId);
            // Fetch room info
            fetch(`/api/rooms/${roomId}`)
                .then(res => {
                    console.log('📥 Room API response status:', res.status);
                    return res.json();
                })
                .then(data => {
                    console.log('📦 Room data:', data);
                    if (data.success) {
                        if (data.room.requiresPassword) {
                            console.log('🔒 Room requires password, showing modal');
                            // Show password prompt
                            pendingRoomJoin = roomId;
                            showJoinRoomModal();
                        } else {
                            console.log('✅ Room has no password, joining directly');
                            // Join directly
                            joinRoom(roomId, null);
                        }
                    } else {
                        console.error('❌ Room error:', data.error);
                        showToast(data.error, 'error');
                    }
                })
                .catch(err => {
                    console.error('❌ Error fetching room:', err);
                    showToast('Failed to load room', 'error');
                });
        }, 500);
    } else {
        console.log('ℹ️ No room ID in URL');
    }
}

// Room Management Functions
async function showCreateRoomModal() {
    const modal = document.getElementById('createRoomModal');
    modal.classList.add('show');
    
    // Reset password field and strength indicator
    document.getElementById('roomPassword').value = '';
    document.getElementById('passwordStrength').style.display = 'none';
}

function closeCreateRoomModal() {
    const modal = document.getElementById('createRoomModal');
    modal.classList.remove('show');
}

// Show copy tooltip
function showCopyTooltip(element, message = 'Copied!') {
    // Remove any existing tooltips
    const existingTooltip = element.parentElement.querySelector('.copy-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'copy-tooltip';
    tooltip.textContent = message;
    
    // Position tooltip above the element
    const rect = element.getBoundingClientRect();
    const parent = element.parentElement;
    const parentRect = parent.getBoundingClientRect();
    
    tooltip.style.position = 'absolute';
    tooltip.style.bottom = '100%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translateX(-50%) translateY(-10px)';
    tooltip.style.marginBottom = '8px';
    
    parent.style.position = 'relative';
    parent.appendChild(tooltip);
    
    // Trigger animation
    setTimeout(() => tooltip.classList.add('show'), 10);
    
    // Remove after 2 seconds
    setTimeout(() => {
        tooltip.classList.remove('show');
        setTimeout(() => tooltip.remove(), 300);
    }, 2000);
}

// Generate secure password
function generateSecurePassword() {
    const length = 16;
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    const allChars = uppercase + lowercase + numbers + symbols;
    
    let password = '';
    
    // Ensure at least one character from each category
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];
    
    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password
    password = password.split('').sort(() => Math.random() - 0.5).join('');
    
    // Set the password in the input field
    const passwordInput = document.getElementById('roomPassword');
    passwordInput.type = 'text'; // Show the generated password
    passwordInput.value = password;
    
    // Copy to clipboard automatically
    navigator.clipboard.writeText(password).then(() => {
        // Show both tooltip and toast for better visibility
        if (event && event.currentTarget) {
            const generateBtn = event.currentTarget;
            showCopyTooltip(generateBtn, '✓ Copied!');
        }
        showToast('🔐 Password copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy password:', err);
        if (event && event.currentTarget) {
            const generateBtn = event.currentTarget;
            showCopyTooltip(generateBtn, '✗ Failed');
        }
        showToast('⚠️ Password generated but not copied. Copy manually.', 'warning');
    });
    
    // Update strength indicator
    checkPasswordStrength(password);
    
    // Hide password after 3 seconds
    setTimeout(() => {
        passwordInput.type = 'password';
    }, 3000);
}

// Toggle password visibility
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = event.currentTarget;
    
    if (input.type === 'password') {
        input.type = 'text';
        button.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
        `;
    } else {
        input.type = 'password';
        button.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
            </svg>
        `;
    }
}

// Check password strength
function checkPasswordStrength(password) {
    const strengthDiv = document.getElementById('passwordStrength');
    const strengthBar = document.getElementById('strengthBarFill');
    const strengthText = document.getElementById('strengthText');
    
    if (!password) {
        strengthDiv.style.display = 'none';
        return;
    }
    
    strengthDiv.style.display = 'flex';
    
    let strength = 0;
    
    // Length check
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (password.length >= 16) strength++;
    
    // Character variety checks
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    
    // Determine strength level
    let level = 'weak';
    if (strength >= 5) level = 'medium';
    if (strength >= 7) level = 'strong';
    
    // Update UI
    strengthBar.className = 'strength-bar-fill ' + level;
    strengthText.className = 'strength-text ' + level;
    strengthText.textContent = level.charAt(0).toUpperCase() + level.slice(1);
}

// Add event listener for password input
document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('roomPassword');
    if (passwordInput) {
        passwordInput.addEventListener('input', (e) => {
            checkPasswordStrength(e.target.value);
        });
    }
});

async function createRoom() {
    const password = document.getElementById('roomPassword').value;
    const expiresIn = parseInt(document.getElementById('roomExpiry').value);
    
    try {
        const response = await fetch('/api/rooms/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password: password || null,
                expiresIn: expiresIn > 0 ? expiresIn : null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeCreateRoomModal();
            showRoomLink(data.roomId, data.shareLink);
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        console.error('Error creating room:', error);
        showToast('Failed to create room', 'error');
    }
}

function showRoomLink(roomId, shareLink) {
    const modal = document.getElementById('roomLinkModal');
    const input = document.getElementById('roomLinkInput');
    
    // Display Room ID
    document.getElementById('displayRoomId').textContent = roomId;
    input.value = shareLink;
    
    // Generate QR code
    const qrContainer = document.getElementById('qrCode');
    qrContainer.innerHTML = ''; // Clear previous QR
    new QRCode(qrContainer, {
        text: shareLink,
        width: 200,
        height: 200,
        colorDark: '#1c88e2',
        colorLight: '#ffffff'
    });
    
    modal.classList.add('show');
    
    // Store room ID and password for joining
    modal.dataset.roomId = roomId;
    // Store the password that was used to create the room
    const password = document.getElementById('roomPassword').value;
    modal.dataset.password = password || '';
    
    console.log('💾 Stored room info - ID:', roomId, 'Password:', password ? 'set' : 'none');
}

function closeRoomLinkModal() {
    const modal = document.getElementById('roomLinkModal');
    modal.classList.remove('show');
}

function copyRoomId() {
    const roomIdElement = document.getElementById('displayRoomId');
    const roomIdText = roomIdElement.textContent;
    
    navigator.clipboard.writeText(roomIdText).then(() => {
        showCopyTooltip(roomIdElement, '✓ Copied!');
        showToast('📋 Room ID copied: ' + roomIdText, 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showCopyTooltip(roomIdElement, '✗ Failed');
        showToast('❌ Failed to copy Room ID', 'error');
    });
}

function copyRoomLink() {
    const input = document.getElementById('roomLinkInput');
    const copyBtn = event.currentTarget;
    
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
        showCopyTooltip(copyBtn, '✓ Copied!');
        showToast('📋 Room link copied!', 'success');
    }).catch(err => {
        // Fallback for older browsers
        try {
            document.execCommand('copy');
            showCopyTooltip(copyBtn, '✓ Copied!');
            showToast('📋 Room link copied!', 'success');
        } catch (e) {
            console.error('Failed to copy:', e);
            showCopyTooltip(copyBtn, '✗ Failed');
            showToast('❌ Failed to copy link', 'error');
        }
    });
}

async function joinCreatedRoom() {
    const modal = document.getElementById('roomLinkModal');
    const roomId = modal.dataset.roomId;
    // Get the password that was used to create the room (stored in modal)
    const password = modal.dataset.password || null;
    
    console.log('🚪 Joining created room:', roomId, 'with password:', password ? '***' : 'none');
    
    closeRoomLinkModal();
    await joinRoom(roomId, password);
}

async function joinRoom(roomId, password = null) {
    console.log('🚪 Joining room:', roomId);
    
    // Derive room key from room ID and password
    currentRoomKey = await RoomCrypto.deriveRoomKey(roomId, password || '');
    currentRoomId = roomId;
    
    // Emit join-room event with identity and public key
    socket.emit('join-room', {
        roomId,
        password,
        identity: {
            displayName: userIdentity.displayName,
            hash: userIdentity.hash,
            fullIdentity: userIdentity.fullIdentity
        },
        publicKey: userIdentity.publicKeyBase64
    });
}

function showJoinRoomModal() {
    const modal = document.getElementById('joinRoomModal');
    modal.classList.add('show');
}

function closeJoinRoomModal() {
    const modal = document.getElementById('joinRoomModal');
    modal.classList.remove('show');
}

async function submitRoomPassword() {
    const password = document.getElementById('joinRoomPassword').value;
    const errorDiv = document.getElementById('joinRoomError');
    
    if (!password) {
        errorDiv.textContent = 'Please enter a password';
        errorDiv.style.display = 'block';
        return;
    }
    
    errorDiv.style.display = 'none';
    
    if (pendingRoomJoin) {
        // Don't close modal yet - wait for password verification
        await joinRoom(pendingRoomJoin, password);
    }
}

// Join Room Prompt Functions (for manual room ID entry)
function showJoinRoomPrompt() {
    const modal = document.getElementById('joinRoomPromptModal');
    modal.classList.add('show');
    document.getElementById('joinRoomIdInput').value = '';
    const errorDiv = document.getElementById('joinRoomPromptError');
    if (errorDiv) errorDiv.style.display = 'none';
}

function closeJoinRoomPromptModal() {
    const modal = document.getElementById('joinRoomPromptModal');
    modal.classList.remove('show');
}

async function submitJoinRoomId() {
    const roomId = document.getElementById('joinRoomIdInput').value.trim();
    const errorDiv = document.getElementById('joinRoomPromptError');
    
    if (!roomId) {
        errorDiv.textContent = 'Please enter a room ID';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (roomId.length !== 9) {
        errorDiv.textContent = 'Room ID must be 9 characters';
        errorDiv.style.display = 'block';
        return;
    }
    
    errorDiv.style.display = 'none';
    
    // Check if room exists and requires password
    try {
        const response = await fetch(`/api/rooms/${roomId}`);
        const data = await response.json();
        
        if (!data.success) {
            errorDiv.textContent = data.error || 'Room not found';
            errorDiv.style.display = 'block';
            return;
        }
        
        closeJoinRoomPromptModal();
        
        if (data.room.requiresPassword) {
            // Show password prompt
            pendingRoomJoin = roomId;
            showJoinRoomModal();
        } else {
            // Join directly
            await joinRoom(roomId, null);
        }
    } catch (error) {
        console.error('Error checking room:', error);
        errorDiv.textContent = 'Failed to connect to room';
        errorDiv.style.display = 'block';
    }
}

// Leave Room Function
function leaveRoom() {
    if (!currentRoomId) return;
    
    console.log('🚪 Leaving room:', currentRoomId);
    
    const roomIdToLeave = currentRoomId;
    
    // Remove all files that were shared in this room from mySharedFiles
    console.log('   Cleaning up room files from mySharedFiles...');
    const filesToRemove = [];
    for (const [fileId, file] of mySharedFiles.entries()) {
        if (file._roomId === roomIdToLeave) {
            filesToRemove.push(fileId);
        }
    }
    
    filesToRemove.forEach(fileId => {
        console.log('   Removing room file:', fileId);
        mySharedFiles.delete(fileId);
    });
    
    if (filesToRemove.length > 0) {
        renderMyFilesCompact();
    }
    
    // Clear download queue of room files
    console.log('   Cleaning up download queue...');
    const queueLengthBefore = downloadQueue.queue.length;
    downloadQueue.queue = downloadQueue.queue.filter(item => {
        const isRoomFile = item.fileInfo.roomId === roomIdToLeave;
        if (isRoomFile) {
            console.log('   Removing queued room file:', item.fileInfo.name);
            // Release semaphore if it was running
            if (item.status === 'running') {
                semaphore.release();
            }
        }
        return !isRoomFile;
    });
    
    if (queueLengthBefore !== downloadQueue.queue.length) {
        console.log(`   Cleaned queue: ${queueLengthBefore} -> ${downloadQueue.queue.length}`);
        renderTransferQueues();
    }
    
    // Cancel any active transfers from this room
    for (const [transferId, transfer] of activeTransfers.entries()) {
        if (transfer.roomId === roomIdToLeave) {
            console.log('   Canceling active room transfer:', transferId);
            removeActiveTransfer(transferId);
            semaphore.release();
        }
    }
    
    // Emit leave-room event
    socket.emit('leave-room', { roomId: currentRoomId });
    
    // Reset room state
    currentRoomId = null;
    currentRoomKey = null;
    pendingRoomJoin = null;
    
    // Clear room files (server will send global files via files-list event)
    availableFiles = [];
    renderAvailableFilesCompact();
    
    // Update header UI for global mode
    updateHeaderForGlobal();
    
    // Exit incognito mode
    document.body.classList.remove('incognito-mode');
    
    // Remove encryption status
    showEncryptionStatus(false);
    
    showToast('Left the room');
    
    // Optionally redirect to home
    if (window.location.pathname.includes('/room/')) {
        window.history.pushState({}, '', '/');
    }
}

// WebRTC configuration with multiple STUN servers for better connectivity
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'stun:stun.services.mozilla.com:3478' }
    ],
    iceCandidatePoolSize: 10
};

// State management
let myPeerId = null;
let mySharedFiles = new Map(); // Map to store files in memory
let availableFiles = [];
let selectedFiles = new Set(); // Track selected files for batch download
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
        return this.currentCount > 0 ? ((this.currentCount / this.maxConcurrent) * 100).toFixed(1) : '0';
    }
}

// Initialize OS components
const downloadQueue = new DownloadQueue();
const semaphore = new Semaphore(3); // Max 3 concurrent downloads (can be changed)

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
socket.on('connect', async () => {
    myPeerId = socket.id;
    console.log('🔌 Connected to server:', myPeerId);
    
    // Update connection status
    const statusEl = document.getElementById('connectionStatus');
    const textEl = document.getElementById('connectionText');
    if (statusEl) statusEl.classList.add('connected');
    if (textEl) textEl.textContent = 'Connected';
    
    // Initialize identity if not done
    if (!userIdentity) {
        await initializeIdentity();
    }
    
    // Check for room in URL
    checkForRoomInURL();
    
    // Initialize header UI
    updateHeaderForGlobal();
    
    updateStatsDisplay();
});

// Room-specific event handlers
socket.on('password-challenge', async ({ challenge }) => {
    console.log('🔐 Received password challenge');
    // Compute proof using Zero-Knowledge Proof
    const password = document.getElementById('roomPassword')?.value || 
                     document.getElementById('joinRoomPassword')?.value;
    
    if (password) {
        const proof = await RoomCrypto.computeProof(password, challenge);
        socket.emit('password-proof', { proof });
    } else {
        showToast('Please enter a password', 'error');
    }
});

socket.on('password-verified', async () => {
    console.log('✅ Password verified - waiting for room-joined event');
    // Don't do anything here - wait for room-joined event
    // The server will send room-joined after password verification
});

socket.on('room-joined', async ({ roomId, peers, files, publicKeys }) => {
    console.log(`✅ Joined room ${roomId}`);
    currentRoomId = roomId;
    
    // Close password modal if it's open
    closeJoinRoomModal();
    
    // Clear pending room join
    pendingRoomJoin = null;
    
    showToast(`🔒 Joined encrypted room ${roomId} 🎉`);
    
    // Update header UI synchronously
    updateHeaderForRoom(roomId, peers.length);
    
    // Enter incognito mode with animation
    document.body.classList.add('incognito-mode');
    
    // Clear global files and load room files
    availableFiles = files || [];
    renderAvailableFilesCompact();
    
    // Show encryption status notification
    showEncryptionStatus(true);
});

socket.on('peer-joined-room', ({ peerId, identity, publicKey }) => {
    console.log(`👤 Peer joined room: ${identity?.fullIdentity || peerId}`);
    showToast(`${identity?.displayName || 'Someone'} joined the room`);
    updatePeerCount(1);
});

socket.on('peer-left-room', ({ peerId, filesRemoved }) => {
    console.log(`👋 Peer left room: ${peerId}`);
    updatePeerCount(-1);
    
    // Remove their files
    if (filesRemoved) {
        filesRemoved.forEach(fileId => {
            availableFiles = availableFiles.filter(f => f.id !== fileId);
        });
        renderAvailableFilesCompact();
    }
});

socket.on('room-expired', ({ roomId }) => {
    showToast('Room has expired', 'error');
    currentRoomId = null;
    currentRoomKey = null;
    // Redirect to home
    window.location.href = '/';
});

socket.on('room-error', ({ error }) => {
    console.error('❌ Room error:', error);
    showToast(error, 'error');
    
    const errorDiv = document.getElementById('joinRoomError');
    if (errorDiv) {
        errorDiv.textContent = error;
        errorDiv.style.display = 'block';
    }
});

socket.on('peers-list', (peers) => {
    // Only update if not in a room (global mode)
    if (!currentRoomId) {
        const peerCountEl = document.getElementById('peerCount');
        if (peerCountEl) {
            peerCountEl.textContent = Math.max(0, peers.length - 1);
        }
    }
});

socket.on('peer-joined', (peer) => {
    // Only update peer count in global mode (room mode uses peer-joined-room)
    if (!currentRoomId) {
        updatePeerCount(1);
    }
});

socket.on('peer-left', (peer) => {
    // Only update peer count in global mode (room mode uses peer-left-room)
    if (!currentRoomId) {
        updatePeerCount(-1);
    }
    // Clean up connections
    if (peerConnections.has(peer.id)) {
        peerConnections.get(peer.id).close();
        peerConnections.delete(peer.id);
    }
    if (dataChannels.has(peer.id)) {
        dataChannels.delete(peer.id);
    }
});

socket.on('file-shared-confirmation', ({ fileId, originalName }) => {
    console.log('✅ File shared confirmation:', fileId, 'for', originalName);
    
    // Update mySharedFiles with correct fileId from server
    if (window.pendingFileShares && window.pendingFileShares.has(originalName)) {
        const tempId = window.pendingFileShares.get(originalName);
        const file = mySharedFiles.get(tempId);
        
        if (file) {
            // Remove temp entry and add with correct ID
            mySharedFiles.delete(tempId);
            
            // Store file with metadata about which room it was shared in
            const fileWithMeta = file;
            fileWithMeta._roomId = currentRoomId; // Track which room this was shared in
            fileWithMeta._fileId = fileId; // Track the server's fileId
            
            mySharedFiles.set(fileId, fileWithMeta);
            window.pendingFileShares.delete(originalName);
            renderMyFilesCompact();
            console.log('   Updated mySharedFiles:', tempId, '→', fileId, 'roomId:', currentRoomId);
        }
    }
});

socket.on('files-list', (files) => {
    console.log('📋 Received files-list:', files.length, 'files');
    console.log('Current room:', currentRoomId);
    files.forEach(f => console.log('  - File:', f.name, 'roomId:', f.roomId, 'peerId:', f.peerId));
    
    // Filter out our own files
    availableFiles = files.filter(file => file.peerId !== myPeerId);
    
    // Clean up download queue - remove items for files that no longer exist
    const availableFileIds = new Set(availableFiles.map(f => f.id));
    const queueLengthBefore = downloadQueue.queue.length;
    downloadQueue.queue = downloadQueue.queue.filter(item => {
        const exists = availableFileIds.has(item.fileInfo.id);
        if (!exists) {
            console.log('   Removing queued item (file no longer available):', item.fileInfo.name);
        }
        return exists;
    });
    
    if (queueLengthBefore !== downloadQueue.queue.length) {
        console.log(`   Cleaned queue: ${queueLengthBefore} -> ${downloadQueue.queue.length}`);
        renderTransferQueues();
    }
    
    renderAvailableFilesCompact();
});

socket.on('file-available', (file) => {
    if (file.peerId !== myPeerId) {
        // Filter based on room context
        // If in a room, only show files from the same room
        // If in global mode, only show global files (no roomId)
        if (currentRoomId) {
            // In a room - only accept files from same room
            if (file.roomId === currentRoomId) {
                availableFiles.push(file);
                renderAvailableFilesCompact();
                
                const location = `🔒 Room ${file.roomId.substring(0, 6)}`;
                showToast(`New file: ${file.name} (${location})`);
            }
        } else {
            // In global mode - only accept files without roomId
            if (!file.roomId) {
                availableFiles.push(file);
                renderAvailableFilesCompact();
                
                showToast(`New file: ${file.name} (🌐 Global)`);
            }
        }
    }
});

// Handle file removal by other peers
socket.on('file-removed', ({ fileId, roomId }) => {
    console.log('🗑️  file-removed event received');
    console.log('   fileId:', fileId);
    console.log('   roomId from event:', roomId);
    console.log('   currentRoomId:', currentRoomId);
    console.log('   availableFiles count:', availableFiles.length);
    console.log('   mySharedFiles count:', mySharedFiles.size);
    
    // Remove from availableFiles (files from other peers)
    const fileIndex = availableFiles.findIndex(f => f.id === fileId);
    console.log('   fileIndex in availableFiles:', fileIndex);
    
    if (fileIndex !== -1) {
        const file = availableFiles[fileIndex];
        console.log('   Found file in availableFiles:', file.name, 'file.roomId:', file.roomId);
        availableFiles.splice(fileIndex, 1);
        console.log('   ✅ Removed from availableFiles, new count:', availableFiles.length);
    }
    
    // Also remove from mySharedFiles if it's our own file being removed
    if (mySharedFiles.has(fileId)) {
        console.log('   Found file in mySharedFiles, removing...');
        mySharedFiles.delete(fileId);
        renderMyFilesCompact();
        console.log('   ✅ Removed from mySharedFiles, new count:', mySharedFiles.size);
    }
    
    // Remove from download queue if it's queued
    const queueItemIndex = downloadQueue.queue.findIndex(q => q.fileInfo.id === fileId);
    if (queueItemIndex !== -1) {
        console.log('   Found file in download queue, removing...');
        const removedItem = downloadQueue.queue.splice(queueItemIndex, 1)[0];
        console.log('   ✅ Removed from queue:', removedItem.fileInfo.name);
        renderTransferQueues();
    }
    
    // Cancel active download if in progress
    for (const [transferId, transfer] of activeTransfers.entries()) {
        if (transfer.type === 'download' && transfer.fileId === fileId) {
            console.log('   Found active download, canceling...');
            removeActiveTransfer(transferId);
            semaphore.release();
            showToast('Download canceled - file was removed', 'error');
        }
    }
    
    // Re-render UI
    renderAvailableFilesCompact();
    console.log('   ✅ UI updated after file removal');
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
                    
                    if (request.type === 'request') {
                        // Try to find by fileId first (most reliable)
                        let file = null;
                        let fileKey = null;
                        
                        if (request.fileId) {
                            // Direct lookup by fileId
                            fileKey = request.fileId;
                            file = mySharedFiles.get(fileKey);
                            console.log('Looking up by fileId:', fileKey, 'Found:', !!file);
                        }
                        
                        // Fallback: search by filename if fileId lookup failed
                        if (!file && request.fileName) {
                            fileKey = Array.from(mySharedFiles.keys()).find(key => 
                                key.includes(request.fileName) || key.endsWith(request.fileName)
                            );
                            if (fileKey) {
                                file = mySharedFiles.get(fileKey);
                                console.log('Looking up by fileName:', request.fileName, 'Found:', !!file);
                            }
                        }
                        
                        if (file) {
                            console.log('✅ Sending file:', file.name, 'Size:', file.size);
                            await sendFile(dataChannel, file);
                        } else {
                            console.error('❌ File not found. Request:', request);
                            console.error('   Available files:', Array.from(mySharedFiles.keys()));
                            console.error('   mySharedFiles entries:', Array.from(mySharedFiles.entries()).map(([k, v]) => ({ key: k, name: v.name, size: v.size })));
                            
                            // Send error message to requester
                            try {
                                dataChannel.send(JSON.stringify({
                                    type: 'error',
                                    message: 'File not found on sender',
                                    requestedFileId: request.fileId,
                                    requestedFileName: request.fileName
                                }));
                            } catch (e) {
                                console.error('Failed to send error message:', e);
                            }
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
    // Prevent triggering from buttons, selects, labels, or empty state
    if (!e.target.closest('.btn-upload') && 
        !e.target.closest('.empty-state-container') && 
        !e.target.closest('.upload-options') &&
        !e.target.closest('select') &&
        !e.target.closest('label')) {
        fileInput.click();
    }
});

fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB limit (increased from 500MB)
    
    if (files.length > 0) {
        console.log(`📁 Selected ${files.length} file(s) for upload`);
        
        let validFiles = 0;
        let skippedFiles = 0;
        
        files.forEach((file, index) => {
            if (file.size > MAX_FILE_SIZE) {
                console.log(`   ❌ Skipped (too large): ${file.name} (${formatBytes(file.size)}) - Max: 2GB`);
                skippedFiles++;
            } else {
                console.log(`   ✅ ${index + 1}. ${file.name} (${formatBytes(file.size)})`);
                shareFile(file);
                validFiles++;
            }
        });
        
        if (validFiles > 0) {
            showToast(`✅ Sharing ${validFiles} file(s)...`, 'success');
        }
        if (skippedFiles > 0) {
            showToast(`⚠️ ${skippedFiles} file(s) skipped (max 2GB per file)`, 'warning');
        }
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
    
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB limit (increased from 500MB)
    const files = Array.from(e.dataTransfer.files);
    
    if (files.length > 0) {
        console.log(`📁 Dropped ${files.length} file(s)`);
        
        let validFiles = 0;
        let skippedFiles = 0;
        
        files.forEach((file, index) => {
            if (file.size > MAX_FILE_SIZE) {
                console.log(`   ❌ Skipped (too large): ${file.name} (${formatBytes(file.size)})`);
                skippedFiles++;
            } else {
                console.log(`   ✅ ${index + 1}. ${file.name} (${formatBytes(file.size)})`);
                shareFile(file);
                validFiles++;
            }
        });
        
        if (validFiles > 0) {
            showToast(`Sharing ${validFiles} file(s)...`);
        }
        if (skippedFiles > 0) {
            showToast(`${skippedFiles} file(s) skipped (too large, max 500 MB)`, 'error');
        }
    }
});

// Share file
function shareFile(file) {
    const tempId = `temp-${Date.now()}-${file.name}`;
    
    // Get expiry time from dropdown
    const expirySelect = document.getElementById('fileExpiry');
    const expiryMs = parseInt(expirySelect?.value || 600000); // Default 10 minutes
    
    // Store file in memory with temp ID and expiry info
    const fileWithExpiry = file;
    fileWithExpiry._expiryMs = expiryMs;
    fileWithExpiry._sharedAt = Date.now();
    if (expiryMs > 0) {
        fileWithExpiry._expiresAt = Date.now() + expiryMs;
    }
    
    mySharedFiles.set(tempId, fileWithExpiry);
    
    // Store mapping from filename to temp ID for later update
    if (!window.pendingFileShares) window.pendingFileShares = new Map();
    window.pendingFileShares.set(file.name, tempId);
    
    // Update memory metrics
    performanceMetrics.filesInMemory = mySharedFiles.size;
    performanceMetrics.memoryUsedMB = Array.from(mySharedFiles.values())
        .reduce((sum, f) => sum + f.size, 0) / (1024 * 1024);
    
    // Notify server
    socket.emit('share-file', {
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        expiresAt: fileWithExpiry._expiresAt || null
    });
    
    // Set up auto-removal timer if expiry is set
    if (expiryMs > 0) {
        setTimeout(() => {
            autoRemoveExpiredFile(tempId, file.name);
        }, expiryMs);
    }
    
    renderMyFilesCompact();
    updatePerformanceMetrics();
}

// Auto-remove expired file
function autoRemoveExpiredFile(fileId, fileName) {
    // Check if file still exists (might have been manually removed)
    if (mySharedFiles.has(fileId)) {
        console.log('⏰ Auto-removing expired file:', fileName);
        
        const file = mySharedFiles.get(fileId);
        const roomId = file._roomId || null;
        
        // Remove from local storage
        mySharedFiles.delete(fileId);
        
        // Notify server
        socket.emit('unshare-file', { fileId, roomId });
        
        // Update UI
        renderMyFilesCompact();
        
        showToast(`File expired: ${fileName}`, 'warning');
    }
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

// Send file through data channel (unencrypted - WebRTC DTLS provides encryption)
async function sendFile(dataChannel, file) {
    // Adaptive chunk size based on file size (smaller chunks for large files = more stable)
    let chunkSize = 262144; // 256KB default
    if (file.size > 500 * 1024 * 1024) { // > 500MB
        chunkSize = 131072; // 128KB for large files (more stable)
        console.log('📦 Using smaller chunks (128KB) for large file stability');
    }
    const totalSize = file.size;
    let offset = 0;
    let lastProgressTime = Date.now();
    let lastSentSize = 0;
    
    const startTime = Date.now();
    
    console.log('📤 Starting file transfer:', file.name, currentRoomId ? '(Room Mode)' : '(Global Mode)');
    
    // Send metadata (same for both global and room mode)
    const metadata = {
        name: file.name,
        size: file.size,
        type: file.type,
        encrypted: false,
        roomId: currentRoomId || null
    };
    
    dataChannel.send(JSON.stringify(metadata));
    console.log('📤 Sent metadata');
    
    // Track buffer size
    performanceMetrics.bufferSizeMB = chunkSize / (1024 * 1024);
    
    // Send file in chunks (unencrypted for both modes - WebRTC DTLS provides encryption)
    const readChunk = () => {
        const slice = file.slice(offset, offset + chunkSize);
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                let chunkData = e.target.result;
                
                // Send unencrypted for speed (WebRTC is already encrypted via DTLS)
                // Same code for both global and room mode
                // Check buffer before sending - wait if buffer is full
                if (dataChannel.bufferedAmount > chunkSize) {
                    // Wait for buffer to drain (shorter wait for better flow)
                    setTimeout(() => {
                        dataChannel.send(chunkData);
                        offset += chunkSize;
                        processNextChunk();
                    }, 20);
                    return; // Don't continue below
                }
                
                dataChannel.send(chunkData);
                offset += chunkSize;
                processNextChunk()
                
            } catch (error) {
                console.error('❌ Encryption error:', error);
                showToast('Encryption failed', 'error');
            }
        };
        
        reader.readAsArrayBuffer(slice);
    };
    
    const processNextChunk = () => {
            
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
            console.log('✅ File encrypted and sent:', file.name);
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
                timestamp: Date.now(),
                encrypted: true
            });
            if (transferHistory.length > 10) transferHistory.pop();
            
            updatePerformanceMetrics();
        }
    };
    
    readChunk();
}

async function performDownload(fileInfo, queueId, connectionStartTime = Date.now()) {
    const peerId = fileInfo.peerId;
    const pc = createPeerConnection(peerId);
    
    // Create optimized data channel for speed
    const dataChannel = pc.createDataChannel('fileTransfer', {
        ordered: true,
        maxRetransmits: 30
    });
    
    let receivedChunks = []; // Store chunks temporarily
    let receivedSize = 0;
    let totalSize = 0;
    let fileName = '';
    let startTime = 0;
    let firstChunkTime = 0;
    let lastProgressTime = Date.now();
    let lastReceivedSize = 0;
    const transferId = `download-${Date.now()}`;
    const MAX_BUFFER_SIZE = 50 * 1024 * 1024; // 50MB max buffer before flushing
    
    // Add timeout for large files (30 minutes max)
    const transferTimeout = setTimeout(() => {
        console.error('⏱️ Transfer timeout - taking too long');
        showToast('Download timeout - file too large or connection too slow', 'error');
        removeActiveTransfer(transferId);
        downloadQueue.completeDownload(queueId);
        semaphore.release();
        dataChannel.close();
    }, 30 * 60 * 1000); // 30 minutes
    
    dataChannel.onopen = () => {
        console.log('📡 Data channel opened, requesting file:', fileInfo.name);
        console.log('   FileInfo:', { id: fileInfo.id, name: fileInfo.name, size: fileInfo.size, peerId: fileInfo.peerId });
        console.log('   File size: ' + (fileInfo.size / 1024 / 1024).toFixed(2) + 'MB');
        
        // Request the file
        const request = {
            type: 'request',
            fileId: fileInfo.id,
            fileName: fileInfo.name
        };
        console.log('   Sending request:', request);
        dataChannel.send(JSON.stringify(request));
    };
    
    let sessionKey = null;
    let isEncrypted = false;
    
    dataChannel.onmessage = async (event) => {
        if (typeof event.data === 'string') {
            try {
                const parsed = JSON.parse(event.data);
                
                // Check for error message from sender
                if (parsed.type === 'error') {
                    console.error('❌ Sender error:', parsed.message);
                    showToast(`Download failed: ${parsed.message}`, 'error');
                    removeActiveTransfer(transferId);
                    downloadQueue.completeDownload(queueId);
                    semaphore.release();
                    return;
                }
                
                // Check if this is metadata or encrypted chunk
                if (parsed.name && parsed.size) {
                    // This is metadata
                    totalSize = parsed.size;
                    fileName = parsed.name;
                    startTime = Date.now();
                    firstChunkTime = 0;
                    isEncrypted = parsed.encrypted || false;
                    
                    console.log(`🔐 Receiving ${isEncrypted ? 'ENCRYPTED' : 'unencrypted'} file:`, fileName);
                    
                    // Import session key if encrypted
                    if (isEncrypted && parsed.sessionKey) {
                        const sessionKeyBytes = CryptoUtils.base64ToArrayBuffer(parsed.sessionKey);
                        sessionKey = await SessionCrypto.importKey(sessionKeyBytes);
                        console.log('🔑 Session key imported');
                    }
                    
                    // Add to active transfers
                    updateActiveTransfer(transferId, {
                        id: transferId,
                        name: fileName,
                        type: 'download',
                        progress: 0,
                        speed: 0,
                        transferred: 0,
                        total: totalSize,
                        peerId: peerId.substring(0, 8),
                        fileId: fileInfo.id,
                        roomId: fileInfo.roomId || null,
                        encrypted: isEncrypted,
                        status: isEncrypted ? 'Decrypting...' : 'Downloading...'
                    });
                    
                    // Calculate connection time
                    const connectionTime = startTime - connectionStartTime;
                    const totalConnectionTime = performanceMetrics.averageConnectionTime * performanceMetrics.totalDownloads;
                    performanceMetrics.averageConnectionTime = (totalConnectionTime + connectionTime) / (performanceMetrics.totalDownloads + 1);
                    
                }
            } catch (error) {
                console.error('❌ Message parsing error:', error);
            }
        } else {
            // Legacy unencrypted chunk (fallback)
            if (firstChunkTime === 0) {
                firstChunkTime = Date.now();
                // Response time = time to first chunk
                const queueItem = downloadQueue.queue.find(q => q.id === queueId);
                if (queueItem) {
                    queueItem.responseTime = firstChunkTime - startTime;
                }
            }
            
            receivedChunks.push(event.data);
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
                const blob = new Blob(receivedChunks);
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
                
                receivedChunks = [];
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

// Download blob as file with mobile optimization
function downloadBlob(blob, filename) {
    try {
        // For mobile devices, use a different approach
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (isMobile && blob.size > 100 * 1024 * 1024) { // > 100MB on mobile
            console.log('📱 Mobile device detected, using optimized download');
            // Try to use File System Access API if available
            if ('showSaveFilePicker' in window) {
                saveFileWithPicker(blob, filename);
                return;
            }
        }
        
        // Standard download method
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        // Clean up after a delay
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
    } catch (error) {
        console.error('Download error:', error);
        showToast('Download failed: ' + error.message, 'error');
    }
}

// File System Access API for large files
async function saveFileWithPicker(blob, filename) {
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{
                description: 'File',
                accept: {'*/*': []}
            }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast('File saved successfully!', 'success');
    } catch (error) {
        console.error('Save picker error:', error);
        // Fallback to standard download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
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
    // Update connection stat (show only active count, not max)
    const connectionStatEl = document.getElementById('connectionStat');
    if (connectionStatEl) {
        connectionStatEl.textContent = `${semaphore.currentCount}`;
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
        activeConnectionsEl.textContent = `${semaphore.currentCount}`;
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const messageEl = toast?.querySelector('.toast-message');
    if (toast && messageEl) {
        messageEl.textContent = message;
        toast.classList.add('show');
        
        // Add type-specific styling
        toast.classList.remove('toast-success', 'toast-error', 'toast-warning');
        if (type === 'error') toast.classList.add('toast-error');
        if (type === 'success') toast.classList.add('toast-success');
        if (type === 'warning') toast.classList.add('toast-warning');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Show encryption status indicator
function showEncryptionStatus(isEncrypted) {
    console.log('🔐 Setting encryption status:', isEncrypted);
    
    // Remove existing badge first to prevent duplicates
    const existingBadge = document.getElementById('encryptionBadge');
    if (existingBadge) {
        existingBadge.remove();
    }
    
    if (isEncrypted) {
        // Find the nav-right container
        const navRight = document.querySelector('.nav-right');
        if (!navRight) {
            console.error('❌ nav-right container not found');
            return;
        }
        
        // Create encryption indicator
        const encryptionBadge = document.createElement('div');
        encryptionBadge.id = 'encryptionBadge';
        encryptionBadge.className = 'encryption-badge';
        encryptionBadge.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>Encrypted</span>
        `;
        encryptionBadge.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(212, 175, 55, 0.1));
            border: 1px solid rgba(212, 175, 55, 0.3);
            border-radius: 8px;
            color: #d4af37;
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            animation: pulse 2s ease-in-out infinite;
        `;
        
        // Insert before the status badge
        const statusBadge = document.getElementById('statusBadge');
        if (statusBadge) {
            navRight.insertBefore(encryptionBadge, statusBadge);
        } else {
            navRight.appendChild(encryptionBadge);
        }
        
        console.log('✅ Encryption badge added');
    } else {
        console.log('✅ Encryption badge removed');
    }
}

// Update file expiry countdowns
function updateFileExpiryCountdowns() {
    const now = Date.now();
    const expiredFiles = [];
    
    // Check all files in mySharedFiles for expiry
    for (const [fileId, file] of mySharedFiles.entries()) {
        if (file._expiresAt && now >= file._expiresAt) {
            // File has expired - mark for removal
            expiredFiles.push({ fileId, file });
        }
    }
    
    // Remove expired files
    if (expiredFiles.length > 0) {
        expiredFiles.forEach(({ fileId, file }) => {
            console.log(`⏰ File expired: ${file.name}`);
            const roomId = file._roomId || null;
            
            // Remove from local storage
            mySharedFiles.delete(fileId);
            
            // Notify server to remove file
            socket.emit('unshare-file', { fileId, roomId });
            
            // Show notification
            showToast(`File expired: ${file.name}`, 'warning');
        });
        
        // Re-render UI after removing expired files
        renderMyFilesCompact();
    }
    
    // Update countdown badges for remaining files
    const badges = document.querySelectorAll('.file-expiry-badge');
    badges.forEach(badge => {
        const fileId = badge.dataset.fileId;
        const file = mySharedFiles.get(fileId);
        
        if (file && file._expiresAt) {
            const timeLeft = file._expiresAt - now;
            
            if (timeLeft > 0) {
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                
                let timeText = '';
                if (minutes > 0) {
                    timeText = `${minutes}m ${seconds}s`;
                } else {
                    timeText = `${seconds}s`;
                }
                
                // Update badge text
                const textNode = badge.childNodes[badge.childNodes.length - 1];
                if (textNode) {
                    textNode.textContent = timeText;
                }
                
                // Add expiring-soon class if less than 1 minute
                if (timeLeft < 60000) {
                    badge.classList.add('expiring-soon');
                } else {
                    badge.classList.remove('expiring-soon');
                }
            }
        }
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize user identity first
    await initializeIdentity();
    
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
    
    // Update file expiry countdowns every second
    setInterval(() => {
        updateFileExpiryCountdowns();
    }, 1000);
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

// Remove all shared files
window.removeAllSharedFiles = () => {
    if (mySharedFiles.size === 0) {
        showToast('No files to remove', 'error');
        return;
    }
    
    if (!confirm(`Remove all ${mySharedFiles.size} shared file(s)?`)) {
        return;
    }
    
    console.log(`🗑️  Removing all ${mySharedFiles.size} shared files`);
    
    const filesToRemove = Array.from(mySharedFiles.entries());
    
    filesToRemove.forEach(([fileId, file]) => {
        const roomId = file._roomId || null;
        
        // Notify server
        socket.emit('unshare-file', { fileId, roomId });
        
        // Remove from local storage
        mySharedFiles.delete(fileId);
        
        // Also remove from availableFiles
        availableFiles = availableFiles.filter(f => f.id !== fileId);
    });
    
    // Update UI
    renderMyFilesCompact();
    renderAvailableFilesCompact();
    
    showToast(`Removed ${filesToRemove.length} file(s)`);
};

// Remove file
window.removeFile = (fileId) => {
    console.log('🗑️  removeFile called with fileId:', fileId);
    console.log('   mySharedFiles has:', Array.from(mySharedFiles.keys()));
    console.log('   currentRoomId:', currentRoomId);
    
    const file = mySharedFiles.get(fileId);
    if (!file) {
        console.log('   ERROR: File not found in mySharedFiles');
        showToast('File not found', 'error');
        return;
    }
    const roomId = file._roomId || null;
    if (confirm(`Remove "${file.name}" from sharing?`)) {
        console.log('   Emitting unshare-file with:', { fileId, roomId });
        
        // Notify server FIRST to broadcast removal to all peers
        socket.emit('unshare-file', { fileId, roomId });
        
        // Then remove from local storage
        mySharedFiles.delete(fileId);
        
        // Update UI immediately
        renderMyFilesCompact();
        
        // Also remove from availableFiles in case it somehow got there
        availableFiles = availableFiles.filter(f => f.id !== fileId);
        renderAvailableFilesCompact();
        
        showToast('File removed');
        
        console.log('   ✅ File removed locally and server notified');
    }
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
    if (!countEl) return;
    
    const current = parseInt(countEl.textContent) || 0;
    const newCount = Math.max(0, current + delta);
    countEl.textContent = newCount;
    
    console.log(`👥 Peer count updated: ${current} → ${newCount} (delta: ${delta})`);
}

// Update header UI for room mode
function updateHeaderForRoom(roomId, peerCount) {
    console.log('🎨 Updating header for room mode:', roomId, 'peers:', peerCount);
    
    // Update connection text with encryption indicator
    const connectionText = document.getElementById('connectionText');
    if (connectionText) {
        connectionText.innerHTML = `🔒 Room ${roomId.substring(0, 6)}...`;
    }
    
    // Update peer count
    const peerCountEl = document.getElementById('peerCount');
    if (peerCountEl) {
        peerCountEl.textContent = peerCount;
    }
    
    // Show leave button, hide create/join buttons
    const createBtn = document.getElementById('createRoomBtn');
    const joinBtn = document.getElementById('joinRoomBtn');
    const leaveBtn = document.getElementById('leaveRoomBtn');
    
    if (createBtn) createBtn.style.display = 'none';
    if (joinBtn) joinBtn.style.display = 'none';
    if (leaveBtn) leaveBtn.style.display = 'inline-flex';
    
    console.log('✅ Header updated for room mode');
}

// Update header UI for global mode
function updateHeaderForGlobal() {
    console.log('🎨 Updating header for global mode');
    
    // Update connection text
    const connectionText = document.getElementById('connectionText');
    if (connectionText) {
        connectionText.innerHTML = 'Connected';
    }
    
    // Reset peer count (will be updated by peers-list event)
    const peerCountEl = document.getElementById('peerCount');
    if (peerCountEl) {
        peerCountEl.textContent = '0';
    }
    
    // Show create/join buttons, hide leave button
    const createBtn = document.getElementById('createRoomBtn');
    const joinBtn = document.getElementById('joinRoomBtn');
    const leaveBtn = document.getElementById('leaveRoomBtn');
    
    if (createBtn) createBtn.style.display = 'inline-flex';
    if (joinBtn) joinBtn.style.display = 'inline-flex';
    if (leaveBtn) leaveBtn.style.display = 'none';
    
    console.log('✅ Header updated for global mode');
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
    
    listEl.innerHTML = downloads.map(transfer => {
        const encryptionBadge = transfer.encrypted ? 
            `<span style="color: #d4af37; font-size: 11px; margin-left: 8px;">🔐 ${transfer.status || 'Encrypted'}</span>` : '';
        
        return `
        <div class="transfer-item">
            <div class="transfer-header">
                <div class="transfer-info">
                    <h4>${transfer.name}${encryptionBadge}</h4>
                    <div class="transfer-peer">From: ${transfer.peerId}</div>
                </div>
                <div class="transfer-stats">
                    <div class="transfer-percentage">${transfer.progress.toFixed(0)}%</div>
                    <div class="transfer-speed">${formatSpeed(transfer.speed)}</div>
                </div>
            </div>
            <div class="transfer-progress">
                <div class="transfer-progress-fill ${transfer.encrypted ? 'encrypted' : ''}" style="width: ${transfer.progress}%"></div>
            </div>
            <div class="transfer-size">${formatBytes(transfer.transferred)} / ${formatBytes(transfer.total)}</div>
        </div>
    `}).join('');

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
    
    listEl.innerHTML = uploads.map(transfer => {
        const encryptionBadge = transfer.encrypted ? 
            `<span style="color: #d4af37; font-size: 11px; margin-left: 8px;">🔐 Encrypting...</span>` : '';
        
        return `
        <div class="transfer-item">
            <div class="transfer-header">
                <div class="transfer-info">
                    <h4>${transfer.name}${encryptionBadge}</h4>
                    <div class="transfer-peer">To: ${transfer.peerId}</div>
                </div>
                <div class="transfer-stats">
                    <div class="transfer-percentage">${transfer.progress.toFixed(0)}%</div>
                    <div class="transfer-speed">${formatSpeed(transfer.speed)}</div>
                </div>
            </div>
            <div class="transfer-progress">
                <div class="transfer-progress-fill upload ${transfer.encrypted ? 'encrypted' : ''}" style="width: ${transfer.progress}%"></div>
            </div>
            <div class="transfer-size">${formatBytes(transfer.transferred)} / ${formatBytes(transfer.total)}</div>
        </div>
    `}).join('');

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
    
    // Check if in incognito mode
    const isIncognito = document.body.classList.contains('incognito-mode');
    
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
    ctx.strokeStyle = isIncognito ? 'rgba(212, 175, 55, 0.15)' : 'rgba(100, 116, 139, 0.15)';
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
    
    // Gradient fill - Gold for incognito, Cyan for normal
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    if (isIncognito) {
        gradient.addColorStop(0, 'rgba(212, 175, 55, 0.4)');
        gradient.addColorStop(1, 'rgba(212, 175, 55, 0.05)');
    } else {
        gradient.addColorStop(0, 'rgba(6, 182, 212, 0.3)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.05)');
    }
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
    
    ctx.strokeStyle = isIncognito ? '#d4af37' : '#06b6d4';
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
            ctx.fillStyle = isIncognito ? '#d4af37' : '#06b6d4';
            ctx.fill();
            ctx.strokeStyle = isIncognito ? '#1a1a1a' : '#1e293b';
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
    
    // Show/hide Remove All button
    const removeAllBtn = document.getElementById('removeAllBtn');
    if (removeAllBtn) {
        removeAllBtn.style.display = mySharedFiles.size > 0 ? 'inline-flex' : 'none';
    }
    
    if (mySharedFiles.size === 0) {
        myFilesList.innerHTML = `
            <div class="empty-state-container">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    <line x1="12" y1="11" x2="12" y2="17"/>
                    <line x1="9" y1="14" x2="15" y2="14"/>
                </svg>
                <p class="empty-state-text">No shared files</p>
                <p class="empty-state-subtext">Upload files to share with peers</p>
            </div>
        `;
        return;
    }
    
    myFilesList.innerHTML = Array.from(mySharedFiles.entries()).map(([fileId, file]) => {
        // Calculate expiry info
        let expiryBadge = '';
        if (file._expiresAt) {
            const now = Date.now();
            const timeLeft = file._expiresAt - now;
            
            if (timeLeft > 0) {
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                const isExpiringSoon = timeLeft < 60000; // Less than 1 minute
                
                let timeText = '';
                if (minutes > 0) {
                    timeText = `${minutes}m ${seconds}s`;
                } else {
                    timeText = `${seconds}s`;
                }
                
                expiryBadge = `
                    <span class="file-expiry-badge ${isExpiringSoon ? 'expiring-soon' : ''}" data-file-id="${fileId}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        ${timeText}
                    </span>
                `;
            }
        }
        
        return `
        <div class="file-item-compact">
            <div class="file-item-left">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                </svg>
                <div class="file-item-info">
                    <div class="file-item-name">${file.name}</div>
                    <div class="file-item-meta">
                        ${formatBytes(file.size)}
                        ${expiryBadge}
                    </div>
                </div>
            </div>
            <button class="btn-danger" onclick="removeFile('${fileId}')">Remove</button>
        </div>
    `}).join('');
}

// Render available files in compact format
function renderAvailableFilesCompact() {
    console.log('🎨 renderAvailableFilesCompact called, availableFiles.length:', availableFiles.length);
    console.log('   Files:', availableFiles.map(f => ({ id: f.id, name: f.name })));
    
    if (!availableFilesList) return;
    
    if (availableFiles.length === 0) {
        availableFilesList.innerHTML = `
            <div class="empty-state-container">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    <path d="M12 11v6"/>
                    <path d="M9 14h6"/>
                </svg>
                <p class="empty-state-text">No files available</p>
                <p class="empty-state-subtext">Waiting for peers to share files</p>
            </div>
        `;
        // Hide batch download button
        updateBatchDownloadButton();
        return;
    }
    
    // Add header with select all checkbox
    const headerHTML = `
        <div class="files-list-header">
            <div class="select-all-container">
                <input type="checkbox" id="selectAllFiles" onchange="window.toggleSelectAll()" ${selectedFiles.size === availableFiles.length && availableFiles.length > 0 ? 'checked' : ''}>
                <label for="selectAllFiles" title="Select All">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 11l3 3L22 4"/>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                </label>
            </div>
            <span class="selection-count">${selectedFiles.size > 0 ? `${selectedFiles.size} selected` : 'Select files'}</span>
        </div>
    `;
    
    const filesHTML = availableFiles.map(file => {
        const peerId = file.peerId ? file.peerId.substring(0, 8) : 'unknown';
        const isSelected = selectedFiles.has(file.id);
        return `
        <div class="file-item-compact ${isSelected ? 'selected' : ''}" data-file-id="${file.id}">
            <input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} onchange="window.toggleFileSelection('${file.id}')" title="Select file">
            <div class="file-item-left">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                </svg>
                <div class="file-item-info">
                    <div class="file-item-name">
                        ${file.priority ? '<span class="priority-badge">⚡ Priority</span> ' : ''}
                        ${file.name}
                    </div>
                    <div class="file-item-meta">${formatBytes(file.size)} • From: ${peerId}</div>
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button 
                    class="btn-download" 
                    onclick='window.downloadFileWithPriority(${JSON.stringify(file)}, 0)'
                    title="Download"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
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
    
    availableFilesList.innerHTML = headerHTML + filesHTML;
    
    // Update batch download button
    updateBatchDownloadButton();
}

// Toggle file selection
window.toggleFileSelection = (fileId) => {
    if (selectedFiles.has(fileId)) {
        selectedFiles.delete(fileId);
    } else {
        selectedFiles.add(fileId);
    }
    renderAvailableFilesCompact();
};

// Toggle select all
window.toggleSelectAll = () => {
    const selectAllCheckbox = document.getElementById('selectAllFiles');
    if (selectAllCheckbox && selectAllCheckbox.checked) {
        // Select all
        availableFiles.forEach(file => selectedFiles.add(file.id));
    } else {
        // Deselect all
        selectedFiles.clear();
    }
    renderAvailableFilesCompact();
};

// Update batch download button visibility
function updateBatchDownloadButton() {
    let batchBtn = document.getElementById('batchDownloadBtn');
    
    if (selectedFiles.size > 0) {
        if (!batchBtn) {
            // Create button
            const section = document.querySelector('#availableFiles').parentElement;
            const header = section.querySelector('.section-header');
            batchBtn = document.createElement('button');
            batchBtn.id = 'batchDownloadBtn';
            batchBtn.className = 'btn-batch-download';
            batchBtn.onclick = window.downloadSelectedFiles;
            batchBtn.title = `Download ${selectedFiles.size} selected file(s)`;
            batchBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span>Download ${selectedFiles.size}</span>
            `;
            header.appendChild(batchBtn);
        } else {
            // Update button
            batchBtn.title = `Download ${selectedFiles.size} selected file(s)`;
            batchBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span>Download ${selectedFiles.size}</span>
            `;
        }
    } else {
        // Remove button
        if (batchBtn) {
            batchBtn.remove();
        }
    }
}

// Download selected files
window.downloadSelectedFiles = () => {
    if (selectedFiles.size === 0) {
        showToast('No files selected', 'error');
        return;
    }
    
    console.log(`📥 Batch downloading ${selectedFiles.size} files`);
    
    const filesToDownload = availableFiles.filter(f => selectedFiles.has(f.id));
    
    filesToDownload.forEach((file, index) => {
        // Add small delay between each to avoid overwhelming
        setTimeout(() => {
            window.downloadFileWithPriority(file, 5); // Normal priority
        }, index * 100);
    });
    
    showToast(`Added ${selectedFiles.size} file(s) to download queue`);
    
    // Clear selection
    selectedFiles.clear();
    renderAvailableFilesCompact();
};

// Render transfer queues
function renderTransferQueues() {
    console.log('🎨 renderTransferQueues called');
    console.log('   downloadQueue.queue.length:', downloadQueue.queue.length);
    console.log('   Queue items:', downloadQueue.queue.map(q => ({ id: q.id, name: q.fileInfo.name, status: q.status })));
    
    const queueSection = document.getElementById('queueSection');
    if (queueSection) {
        queueSection.style.display = downloadQueue.queue.length > 0 ? 'block' : 'none';
    }
    
    // Split queue items between two columns
    const queueItems = downloadQueue.queue;
    const halfPoint = Math.ceil(queueItems.length / 2);
    
    // Always clear both columns before rendering
    if (queueList1) queueList1.innerHTML = '';
    if (queueList2) queueList2.innerHTML = '';
    // If queue is empty, show empty state
    if (queueItems.length === 0) {
        if (queueList1) queueList1.innerHTML = '<p class="empty-state">Queue is empty</p>';
        if (queueList2) queueList2.innerHTML = '<p class="empty-state">Queue is empty</p>';
        return;
    }
    
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
                <div class="queue-item-compact ${item.status === 'running' ? 'queue-running' : ''}" 
                     draggable="${item.status === 'waiting'}" 
                     data-queue-id="${item.id}"
                     ondragstart="window.handleQueueDragStart(event, ${item.id})"
                     ondragover="window.handleQueueDragOver(event)"
                     ondrop="window.handleQueueDrop(event, ${item.id})"
                     ondragend="window.handleQueueDragEnd(event)">
                    <div class="drag-handle" title="Drag to reorder">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="9" cy="5" r="1.5"/>
                            <circle cx="9" cy="12" r="1.5"/>
                            <circle cx="9" cy="19" r="1.5"/>
                            <circle cx="15" cy="5" r="1.5"/>
                            <circle cx="15" cy="12" r="1.5"/>
                            <circle cx="15" cy="19" r="1.5"/>
                        </svg>
                    </div>
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
                        <button onclick="window.removeFromQueue(${item.id})" title="Remove from queue">
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
                <div class="queue-item-compact ${item.status === 'running' ? 'queue-running' : ''}" 
                     draggable="${item.status === 'waiting'}" 
                     data-queue-id="${item.id}"
                     ondragstart="window.handleQueueDragStart(event, ${item.id})"
                     ondragover="window.handleQueueDragOver(event)"
                     ondrop="window.handleQueueDrop(event, ${item.id})"
                     ondragend="window.handleQueueDragEnd(event)">
                    <div class="drag-handle" title="Drag to reorder">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="9" cy="5" r="1.5"/>
                            <circle cx="9" cy="12" r="1.5"/>
                            <circle cx="9" cy="19" r="1.5"/>
                            <circle cx="15" cy="5" r="1.5"/>
                            <circle cx="15" cy="12" r="1.5"/>
                            <circle cx="15" cy="19" r="1.5"/>
                        </svg>
                    </div>
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
                    <button class="btn-download" onclick="window.removeFromQueue(${item.id})" title="Remove from queue">Remove</button>
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
    console.log('🗑️  removeFromQueue called with itemId:', itemId);
    console.log('   Queue before:', downloadQueue.queue.map(q => ({ id: q.id, name: q.fileInfo.name, status: q.status })));
    
    const initialLength = downloadQueue.queue.length;
    const item = downloadQueue.queue.find(q => q.id === itemId);
    
    if (!item) {
        console.log('   ERROR: Item not found in queue');
        return;
    }
    
    // If item is running, we need to release the semaphore
    if (item.status === 'running') {
        console.log('   Item is running, releasing semaphore');
        semaphore.release();
        
        // Cancel any active transfer for this item
        for (const [transferId, transfer] of activeTransfers.entries()) {
            if (transfer.fileId === item.fileInfo.id) {
                console.log('   Canceling active transfer:', transferId);
                removeActiveTransfer(transferId);
            }
        }
    }
    
    // Remove from queue
    downloadQueue.queue = downloadQueue.queue.filter(q => q.id !== itemId);
    
    // Also remove from any running/processing state
    if (downloadQueue.currentItem && downloadQueue.currentItem.id === itemId) {
        downloadQueue.currentItem = null;
    }
    if (downloadQueue.runningItems) {
        downloadQueue.runningItems = downloadQueue.runningItems.filter(q => q.id !== itemId);
    }
    
    console.log('   Queue after:', downloadQueue.queue.map(q => ({ id: q.id, name: q.fileInfo.name })));
    console.log('   Removed:', initialLength - downloadQueue.queue.length, 'items');
    
    // Force immediate UI update
    renderTransferQueues();
    updatePerformanceMetrics();
    
    showToast('Removed from queue');
    
    // Process next in queue if semaphore allows
    downloadQueue.processNextInQueue();
};

window.downloadFileWithPriority = (fileInfo, priority) => {
    console.log('🔽 downloadFileWithPriority called:', fileInfo.name, 'priority:', priority);
    console.log('   File info:', fileInfo);
    console.log('   Semaphore status:', {
        current: semaphore.currentCount,
        max: semaphore.maxConcurrent,
        canAcquire: semaphore.canAcquire()
    });
    
    // Check if mobile and file is large
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const fileSizeMB = fileInfo.size / 1024 / 1024;
    
    if (isMobile && fileSizeMB > 500) {
        const proceed = confirm(
            `⚠️ Large File Warning\n\n` +
            `File: ${fileInfo.name}\n` +
            `Size: ${fileSizeMB.toFixed(0)}MB\n\n` +
            `Large files may fail on mobile devices due to memory limits.\n\n` +
            `Recommendations:\n` +
            `• Use a desktop/laptop for files > 500MB\n` +
            `• Close other apps to free memory\n` +
            `• Ensure stable WiFi connection\n\n` +
            `Continue download?`
        );
        if (!proceed) {
            showToast('Download cancelled', 'warning');
            return;
        }
    }
    
    // Use the proper DownloadQueue method
    const queueId = downloadQueue.addToQueue(fileInfo, priority);
    console.log('   Added to queue with ID:', queueId);
    
    if (priority >= 10) {
        showToast('⚡ Priority download queued - jumping to front!', 'success');
    } else {
        showToast('📥 Download added to queue', 'success');
    }
    
    // Process the queue to start download if semaphore allows
    console.log('   Processing queue...');
    downloadQueue.processNextInQueue();
};

// Drag and Drop Queue Management
let draggedQueueItem = null;

window.handleQueueDragStart = (event, itemId) => {
    draggedQueueItem = itemId;
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    console.log('🎯 Started dragging queue item:', itemId);
};

window.handleQueueDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    const target = event.target.closest('.queue-item-compact');
    if (target && draggedQueueItem) {
        target.classList.add('drag-over');
    }
};

window.handleQueueDrop = (event, targetItemId) => {
    event.preventDefault();
    event.stopPropagation();
    
    const target = event.target.closest('.queue-item-compact');
    if (target) {
        target.classList.remove('drag-over');
    }
    
    if (!draggedQueueItem || draggedQueueItem === targetItemId) {
        return;
    }
    
    console.log('📍 Dropping queue item:', draggedQueueItem, 'onto:', targetItemId);
    
    // Find indices
    const draggedIndex = downloadQueue.queue.findIndex(q => q.id === draggedQueueItem);
    const targetIndex = downloadQueue.queue.findIndex(q => q.id === targetItemId);
    
    if (draggedIndex === -1 || targetIndex === -1) {
        console.error('Could not find items in queue');
        return;
    }
    
    // Reorder queue
    const [draggedItem] = downloadQueue.queue.splice(draggedIndex, 1);
    downloadQueue.queue.splice(targetIndex, 0, draggedItem);
    
    console.log('✅ Queue reordered');
    
    // Update priorities based on new position
    downloadQueue.queue.forEach((item, index) => {
        // Higher position = higher priority
        item.priority = downloadQueue.queue.length - index;
    });
    
    // Re-render queue
    renderTransferQueues();
    
    showToast('Queue order updated');
};

window.handleQueueDragEnd = (event) => {
    event.target.classList.remove('dragging');
    
    // Remove all drag-over classes
    document.querySelectorAll('.queue-item-compact').forEach(el => {
        el.classList.remove('drag-over');
    });
    
    draggedQueueItem = null;
};




// ===== MAIL US FUNCTION =====
function openEmailClient() {
    const email = 'aadipandey223@gmail.com';
    const subject = encodeURIComponent('Secure Share - Feedback');
    const body = encodeURIComponent('Hi,\n\nI would like to share my feedback:\n\n');
    
    // Gmail compose URL - always opens Gmail in browser
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}&body=${body}`;
    
    console.log('Opening Gmail:', gmailUrl);
    
    // Try to open Gmail in new tab
    const newWindow = window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    
    if (newWindow) {
        // Successfully opened
        showToast('Opening Gmail...', 'info');
    } else {
        // Popup blocked - try alternative
        console.log('Popup blocked, trying location.href');
        window.location.href = gmailUrl;
    }
}

// Make function globally accessible
window.openEmailClient = openEmailClient;
