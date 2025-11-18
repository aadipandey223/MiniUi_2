const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

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
app.use(express.static('public'));

// Store connected peers and their shared files
const peers = new Map();
const sharedFiles = new Map();

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Peer connected: ${socket.id}`);
  
  // Store peer info
  peers.set(socket.id, {
    id: socket.id,
    files: []
  });

  // Send current peers list to the new peer
  socket.emit('peers-list', Array.from(peers.values()));
  
  // Send current shared files to the new peer
  socket.emit('files-list', Array.from(sharedFiles.values()));

  // Notify other peers about new connection
  socket.broadcast.emit('peer-joined', {
    id: socket.id
  });

  // Handle file sharing announcement
  socket.on('share-file', (fileInfo) => {
    const fileId = `${socket.id}-${Date.now()}-${fileInfo.name}`;
    const fileData = {
      id: fileId,
      name: fileInfo.name,
      size: fileInfo.size,
      type: fileInfo.type,
      peerId: socket.id
    };
    
    sharedFiles.set(fileId, fileData);
    
    // Update peer's file list
    const peer = peers.get(socket.id);
    if (peer) {
      peer.files.push(fileId);
    }
    
    // Broadcast to all other peers
    io.emit('file-available', fileData);
    console.log(`File shared: ${fileInfo.name} by ${socket.id}`);
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

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Peer disconnected: ${socket.id}`);
    
    // Remove peer's shared files
    const peer = peers.get(socket.id);
    if (peer) {
      peer.files.forEach(fileId => {
        sharedFiles.delete(fileId);
      });
    }
    
    peers.delete(socket.id);
    
    // Notify other peers
    io.emit('peer-left', { id: socket.id });
    io.emit('files-list', Array.from(sharedFiles.values()));
  });
});

server.listen(PORT, () => {
  console.log(`🚀 P2P File Sharing Server running on port ${PORT}`);
  console.log(`📡 Open http://localhost:${PORT} in your browser`);
});
