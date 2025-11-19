const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { RoomCrypto, CryptoUtils } = require('./utils/crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files FIRST (before any routes)
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    console.log('📁 Serving static file:', filePath);
  }
}));

// Store connected peers and their shared files
const peers = new Map();
const sharedFiles = new Map();

// Store rooms with encryption and isolation
const rooms = new Map();
// Format: roomId -> { id, createdBy, createdAt, passwordHash, peers: Set(), files: Map(), publicKeys: Map() }

// Store active ZKP challenges
const zkpChallenges = new Map();
// Format: socketId -> { challenge, timestamp }

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Create private room
app.post('/api/rooms/create', async (req, res) => {
  try {
    const { password, expiresIn } = req.body;
    const roomId = CryptoUtils.generateRoomId();
    
    const room = {
      id: roomId,
      createdAt: Date.now(),
      expiresAt: expiresIn ? Date.now() + expiresIn : null,
      passwordHash: password ? RoomCrypto.hashPassword(password) : null,
      peers: new Set(),
      files: new Map(),
      publicKeys: new Map(),
      activityLog: []
    };
    
    rooms.set(roomId, room);
    
    res.json({
      success: true,
      roomId,
      shareLink: `${req.protocol}://${req.get('host')}/room/${roomId}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get room info (public data only)
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  
  // Check if expired
  if (room.expiresAt && Date.now() > room.expiresAt) {
    rooms.delete(roomId);
    return res.status(410).json({ success: false, error: 'Room expired' });
  }
  
  res.json({
    success: true,
    room: {
      id: room.id,
      requiresPassword: !!room.passwordHash,
      peerCount: room.peers.size,
      fileCount: room.files.size,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt
    }
  });
});

// Serve room page
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Peer connected: ${socket.id}`);
  
  // Store peer info (global, before room join)
  peers.set(socket.id, {
    id: socket.id,
    roomId: null,
    identity: null,
    publicKey: null,
    files: [], // Deprecated - kept for compatibility
    globalFiles: [],
    roomFiles: []
  });

  // Handle room join with Zero-Knowledge Proof
  socket.on('join-room', async ({ roomId, password, identity, publicKey }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      return socket.emit('room-error', { error: 'Room not found' });
    }
    
    // Check if room expired
    if (room.expiresAt && Date.now() > room.expiresAt) {
      rooms.delete(roomId);
      return socket.emit('room-error', { error: 'Room expired' });
    }
    
    // Zero-Knowledge Proof verification for password-protected rooms
    if (room.passwordHash) {
      if (!password) {
        // Send challenge for ZKP
        const challenge = RoomCrypto.generateChallenge();
        zkpChallenges.set(socket.id, { challenge, timestamp: Date.now(), roomId, identity, publicKey });
        return socket.emit('password-challenge', { challenge });
      }
      
      // Verify password (direct hash comparison)
      const passwordHash = RoomCrypto.hashPassword(password);
      if (passwordHash !== room.passwordHash) {
        return socket.emit('room-error', { error: 'Invalid password' });
      }
    }
    
    // Join room
    socket.join(roomId);
    room.peers.add(socket.id);
    
    // Store identity and public key
    if (identity) {
      peers.get(socket.id).identity = identity;
    }
    if (publicKey) {
      room.publicKeys.set(socket.id, publicKey);
      peers.get(socket.id).publicKey = publicKey;
    }
    
    peers.get(socket.id).roomId = roomId;
    
    // Log activity
    room.activityLog.push({
      timestamp: Date.now(),
      peerId: socket.id,
      identity: identity?.displayName || 'Anonymous',
      action: 'joined'
    });
    
    // Send room data to joiner
    socket.emit('room-joined', {
      roomId,
      peers: Array.from(room.peers).map(peerId => ({
        id: peerId,
        identity: peers.get(peerId)?.identity,
        publicKey: room.publicKeys.get(peerId)
      })),
      files: Array.from(room.files.values()),
      publicKeys: Object.fromEntries(room.publicKeys)
    });
    
    // Notify others in room
    socket.to(roomId).emit('peer-joined-room', {
      peerId: socket.id,
      identity: identity,
      publicKey: publicKey
    });
    
    console.log(`Peer ${socket.id} joined room ${roomId}`);
  });

  // Handle password proof for ZKP
  socket.on('password-proof', ({ proof }) => {
    const challengeData = zkpChallenges.get(socket.id);
    
    if (!challengeData) {
      return socket.emit('room-error', { error: 'No challenge found' });
    }
    
    const room = rooms.get(challengeData.roomId);
    if (!room) {
      zkpChallenges.delete(socket.id);
      return socket.emit('room-error', { error: 'Room not found' });
    }
    
    // Verify proof
    const isValid = RoomCrypto.verifyProof(proof, room.passwordHash, challengeData.challenge);
    
    if (!isValid) {
      zkpChallenges.delete(socket.id);
      return socket.emit('room-error', { error: 'Invalid password' });
    }
    
    // Password verified - complete room join
    const roomId = challengeData.roomId;
    const identity = challengeData.identity;
    const publicKey = challengeData.publicKey;
    
    zkpChallenges.delete(socket.id);
    
    // Join room
    socket.join(roomId);
    room.peers.add(socket.id);
    
    // Store identity and public key
    if (identity) {
      peers.get(socket.id).identity = identity;
    }
    if (publicKey) {
      room.publicKeys.set(socket.id, publicKey);
      peers.get(socket.id).publicKey = publicKey;
    }
    
    peers.get(socket.id).roomId = roomId;
    
    // Log activity
    room.activityLog.push({
      timestamp: Date.now(),
      peerId: socket.id,
      identity: identity?.displayName || 'Anonymous',
      action: 'joined'
    });
    
    // Send room data to joiner
    socket.emit('room-joined', {
      roomId,
      peers: Array.from(room.peers).map(peerId => ({
        id: peerId,
        identity: peers.get(peerId)?.identity,
        publicKey: room.publicKeys.get(peerId)
      })),
      files: Array.from(room.files.values()),
      publicKeys: Object.fromEntries(room.publicKeys)
    });
    
    // Notify others in room
    socket.to(roomId).emit('peer-joined-room', {
      peerId: socket.id,
      identity: identity,
      publicKey: publicKey
    });
    
    console.log(`Peer ${socket.id} joined room ${roomId} (password verified)`);
  });

  // Send current peers list to the new peer (global)
  socket.emit('peers-list', Array.from(peers.values()));
  
  // Send current shared files to the new peer (global)
  socket.emit('files-list', Array.from(sharedFiles.values()));

  // Notify other peers about new connection (global)
  socket.broadcast.emit('peer-joined', {
    id: socket.id
  });

  // Handle file sharing announcement
  socket.on('share-file', (fileInfo) => {
    const peer = peers.get(socket.id);
    const roomId = peer?.roomId;
    
    // Room-based sharing
    if (roomId) {
      const room = rooms.get(roomId);
      if (!room) return;
      
      const fileId = `${socket.id}-${Date.now()}-${fileInfo.name}`;
      const fileData = {
        id: fileId,
        name: fileInfo.name,
        size: fileInfo.size,
        type: fileInfo.type,
        peerId: socket.id,
        identity: peer.identity,
        roomId: roomId,
        sharedAt: Date.now()
      };
      
      room.files.set(fileId, fileData);
      
      // Update peer's file list (track with roomId)
      if (peer) {
        if (!peer.roomFiles) peer.roomFiles = [];
        peer.roomFiles.push(fileId);
      }
      
      // Log activity
      room.activityLog.push({
        timestamp: Date.now(),
        peerId: socket.id,
        identity: peer.identity?.displayName || 'Anonymous',
        action: 'uploaded',
        fileName: fileInfo.name
      });
      
      // Broadcast only to peers in same room
      io.to(roomId).emit('file-available', fileData);
      
      // Send confirmation back to sharer with the fileId
      socket.emit('file-shared-confirmation', { fileId, originalName: fileInfo.name });
      
      console.log(`📁 File shared in room ${roomId}: ${fileInfo.name} by ${socket.id}`);
      console.log(`   Added to room.files (size: ${room.files.size}) and peer.roomFiles (length: ${peer.roomFiles.length})`);
      
    } else {
      // Global sharing (fallback for non-room mode)
      const fileId = `${socket.id}-${Date.now()}-${fileInfo.name}`;
      const fileData = {
        id: fileId,
        name: fileInfo.name,
        size: fileInfo.size,
        type: fileInfo.type,
        peerId: socket.id
      };
      
      sharedFiles.set(fileId, fileData);
      
      // Update peer's global file list
      if (peer) {
        if (!peer.globalFiles) peer.globalFiles = [];
        peer.globalFiles.push(fileId);
      }
      
      // Broadcast to all other peers
      io.emit('file-available', fileData);
      
      // Send confirmation back to sharer with the fileId
      socket.emit('file-shared-confirmation', { fileId, originalName: fileInfo.name });
      
      console.log(`🌍 File shared globally: ${fileInfo.name} by ${socket.id}`);
      console.log(`   Added to sharedFiles (size: ${sharedFiles.size}) and peer.globalFiles (length: ${peer.globalFiles.length})`);
    }
  });

  // Handle WebRTC signaling
  socket.on('offer', (data) => {
    const { offer, targetPeerId } = data;
    socket.to(targetPeerId).emit('offer', {
      offer,
      fromPeerId: socket.id
    });
  });

  socket.on('answer', (data) => {
    const { answer, targetPeerId } = data;
    socket.to(targetPeerId).emit('answer', {
      answer,
      fromPeerId: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    const { candidate, targetPeerId } = data;
    socket.to(targetPeerId).emit('ice-candidate', {
      candidate,
      fromPeerId: socket.id
    });
  });

  // Handle file unshare/removal
  socket.on('unshare-file', ({ fileId, roomId }) => {
    const peer = peers.get(socket.id);
    if (!peer) return;
    
    console.log(`🗑️  Unsharing file ${fileId} ${roomId ? 'from room ' + roomId : 'globally'}`);
    
    if (roomId) {
      // Remove from room
      const room = rooms.get(roomId);
      if (room) {
        const fileExists = room.files.has(fileId);
        room.files.delete(fileId);
        // Remove from peer's room files
        if (peer.roomFiles) {
          peer.roomFiles = peer.roomFiles.filter(id => id !== fileId);
        }
        console.log(`   Removed from room.files (existed: ${fileExists}), notifying room members`);
        
        // Notify ALL room members INCLUDING the sender
        io.to(roomId).emit('file-removed', { fileId, roomId });
        
        // Also send updated files list to ensure sync
        const roomFilesList = Array.from(room.files.values());
        io.to(roomId).emit('files-list', roomFilesList);
      }
    } else {
      // Remove from global
      const wasDeleted = sharedFiles.delete(fileId);
      console.log(`   Deleted from sharedFiles:`, wasDeleted, 'Remaining:', sharedFiles.size);
      // Remove from peer's global files
      if (peer.globalFiles) {
        peer.globalFiles = peer.globalFiles.filter(id => id !== fileId);
      }
      
      // Notify ALL peers INCLUDING the sender (use io.emit not socket.broadcast.emit)
      io.emit('file-removed', { fileId, roomId: null });
      
      // Send updated global files list to ALL peers
      const globalFilesList = Array.from(sharedFiles.values());
      io.emit('files-list', globalFilesList);
    }
    
    console.log(`File ${fileId} unshared by ${socket.id} ${roomId ? 'in room ' + roomId : 'globally'}`);
  });

  // Handle manual room leave (before disconnect)
  socket.on('leave-room', ({ roomId }) => {
    const peer = peers.get(socket.id);
    if (!peer || peer.roomId !== roomId) return;
    
    const room = rooms.get(roomId);
    if (room) {
      // Remove peer from room
      room.peers.delete(socket.id);
      room.publicKeys.delete(socket.id);
      
      // Remove peer's room files from room
      const roomFilesToRemove = peer.roomFiles || [];
      roomFilesToRemove.forEach(fileId => {
        room.files.delete(fileId);
      });
      
      // Log activity
      room.activityLog.push({
        timestamp: Date.now(),
        peerId: socket.id,
        identity: peer.identity?.displayName || 'Anonymous',
        action: 'left'
      });
      
      // Notify others in room to remove this peer's files
      socket.to(roomId).emit('peer-left-room', {
        peerId: socket.id,
        filesRemoved: roomFilesToRemove
      });
      
      // Send updated room files list to remaining room members
      const remainingRoomFiles = Array.from(room.files.values());
      socket.to(roomId).emit('files-list', remainingRoomFiles);
      
      // Clear only room files, keep global files
      peer.roomFiles = [];
      
      // Leave Socket.io room
      socket.leave(roomId);
      
      console.log(`Peer ${socket.id} left room ${roomId}`);
      
      // Delete empty rooms
      if (room.peers.size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
      }
    }
    
    // Reset peer's room state (return to global)
    peer.roomId = null;
    
    console.log(`📤 Sending global files to ${socket.id}:`, sharedFiles.size, 'files');
    console.log(`   Peer's globalFiles:`, peer.globalFiles);
    console.log(`   Peer's roomFiles (should be empty):`, peer.roomFiles);
    console.log(`   sharedFiles contents:`, Array.from(sharedFiles.keys()));
    
    // Send global files list (including this peer's global files if any)
    socket.emit('files-list', Array.from(sharedFiles.values()));
    socket.emit('peers-list', Array.from(peers.values()).filter(p => !p.roomId));
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Peer disconnected: ${socket.id}`);
    
    const peer = peers.get(socket.id);
    
    // Remove from room if in one
    if (peer?.roomId) {
      const room = rooms.get(peer.roomId);
      if (room) {
        room.peers.delete(socket.id);
        room.publicKeys.delete(socket.id);
        
        // Remove peer's room files from room
        const roomFilesToRemove = peer.roomFiles || [];
        roomFilesToRemove.forEach(fileId => {
          room.files.delete(fileId);
        });
        
        // Log activity
        room.activityLog.push({
          timestamp: Date.now(),
          peerId: socket.id,
          identity: peer.identity?.displayName || 'Anonymous',
          action: 'disconnected'
        });
        
        // Notify others in room
        io.to(peer.roomId).emit('peer-left-room', { 
          peerId: socket.id,
          filesRemoved: roomFilesToRemove
        });
        
        // Delete empty rooms (optional)
        if (room.peers.size === 0) {
          rooms.delete(peer.roomId);
          console.log(`Room ${peer.roomId} deleted (empty)`);
        }
      }
    }
    
    // Remove peer's global shared files
    if (peer) {
      const globalFilesToRemove = peer.globalFiles || [];
      globalFilesToRemove.forEach(fileId => {
        sharedFiles.delete(fileId);
      });
    }
    
    peers.delete(socket.id);
    zkpChallenges.delete(socket.id);
    
    // Notify other peers (global)
    io.emit('peer-left', { id: socket.id });
    io.emit('files-list', Array.from(sharedFiles.values()));
  });
});

// Room cleanup service - Delete expired rooms every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.expiresAt && now > room.expiresAt) {
      // Notify peers in room
      io.to(roomId).emit('room-expired', { roomId });
      
      // Disconnect all peers from room
      for (const peerId of room.peers) {
        const socket = io.sockets.sockets.get(peerId);
        if (socket) {
          socket.leave(roomId);
        }
      }
      
      rooms.delete(roomId);
      console.log(`Room ${roomId} expired and deleted`);
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Cleanup old ZKP challenges (older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  for (const [socketId, challenge] of zkpChallenges.entries()) {
    if (now - challenge.timestamp > timeout) {
      zkpChallenges.delete(socketId);
    }
  }
}, 60 * 1000); // Every minute

server.listen(PORT, () => {
  console.log(`🚀 P2P File Sharing Server running on port ${PORT}`);
  console.log(`📡 Open http://localhost:${PORT} in your browser`);
  console.log(`🔒 Triple-layer encryption enabled`);
  console.log(`🏠 Private rooms supported`);
});
