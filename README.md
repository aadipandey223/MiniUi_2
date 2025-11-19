# 🔐 Secure Share - P2P File Transfer

A modern peer-to-peer file sharing application with **triple-layer encryption**, private rooms, and advanced OS concepts implementation. Built with WebRTC for direct browser-to-browser transfers.

## ✨ Key Features

### 🔒 Security & Privacy
- **Triple-Layer Encryption**
  - Layer 1: Ephemeral session keys (AES-256-GCM)
  - Layer 2: Room-based encryption (AES-256-GCM)
  - Layer 3: Digital signatures (RSA-OAEP)
- **Private Rooms** with password protection
- **Zero-Knowledge Proof** authentication
- **End-to-End Encryption** - server never sees your data
- **Incognito Mode** for private room sessions

### 🚀 File Sharing
- Direct P2P file transfer using WebRTC DataChannels
- No file size limits (files stay in browser memory)
- Multiple file upload support
- Batch download with file selection
- **Auto-expiring files** with countdown timers
- Drag-and-drop file upload
- Real-time transfer progress

### 🎯 OS Concepts Implementation
- **CPU Scheduling Algorithms**
  - FCFS (First Come First Serve)
  - SJF (Shortest Job First)
  - Priority Scheduling
- **Semaphore-based Connection Limiting** (max 3 concurrent)
- **Download Queue Management** with drag-and-drop reordering
- **Resource Utilization Monitoring**
- **Performance Metrics Dashboard**

### 📊 Real-time Monitoring
- Live network speed graph
- Active transfers tracking (uploads/downloads)
- Connection statistics
- Queue wait times and throughput
- Peak speed tracking

### 🎨 Modern UI/UX
- Beautiful gradient design with glassmorphism
- Responsive mobile-first design
- Dark theme with incognito mode
- Smooth animations and transitions
- QR code sharing for mobile devices

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **P2P**: WebRTC DataChannels
- **Encryption**: Web Crypto API (AES-256-GCM, RSA-OAEP, SHA-256)
- **Real-time**: Socket.io for signaling

## 📦 Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd secure-share
```

2. **Install dependencies**
```bash
npm install
```

3. **Start the server**
```bash
npm start
```

4. **Open in browser**
```
http://localhost:3000
```

## 🚀 Usage

### Basic File Sharing (Global Mode)
1. Open the website in multiple browser tabs/windows
2. Select files to share using drag-and-drop or file picker
3. Set file expiry time (30 sec to 24 hours, or never)
4. Files appear in "Available Files" for other peers
5. Click "Download" to transfer files via P2P

### Private Room Mode
1. Click **"Create"** to create a private room
2. Set optional password and expiry time
3. Share the room link or QR code with others
4. Files shared in rooms are isolated and encrypted
5. Click **"Leave"** to exit the room

### Advanced Features
- **Batch Download**: Select multiple files and download together
- **Priority Queue**: Mark files as priority for faster download
- **Drag Queue**: Reorder download queue by dragging items
- **Remove All**: Clear all shared files at once

## 🔐 Security Architecture

### Encryption Layers
```
┌─────────────────────────────────────┐
│  Layer 3: Digital Signatures        │
│  (RSA-OAEP - Identity Verification) │
├─────────────────────────────────────┤
│  Layer 2: Room Encryption           │
│  (AES-256-GCM - Room Isolation)     │
├─────────────────────────────────────┤
│  Layer 1: Session Encryption        │
│  (AES-256-GCM - Ephemeral Keys)     │
└─────────────────────────────────────┘
```

### Zero-Knowledge Proof
- Password verification without sending the password
- Server never stores or sees actual passwords
- Challenge-response authentication protocol

## 📊 OS Concepts

### Semaphore Implementation
```javascript
class Semaphore {
    constructor(maxConcurrent = 3)
    acquire() // Request resource
    release() // Free resource
    canAcquire() // Check availability
}
```

### Download Queue Scheduling
- **FCFS**: First-come, first-served
- **SJF**: Shortest job first (smallest files)
- **Priority**: High-priority files first

### Performance Metrics
- Average wait time
- Average turnaround time
- Throughput (files/minute)
- Resource utilization percentage

## 🌐 Deployment

### Vercel (Recommended)
```bash
npm install -g vercel
vercel
```

### Docker
```bash
docker build -t secure-share .
docker run -p 3000:3000 secure-share
```

### Other Platforms
- **Heroku**: Use included `Procfile`
- **Railway**: Connect GitHub repo
- **Render**: Deploy as Web Service
- **DigitalOcean**: App Platform deployment

See [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md) for detailed deployment instructions.

## 📁 Project Structure

```
secure-share/
├── public/
│   ├── index.html          # Main UI
│   ├── styles.css          # Styling with themes
│   ├── app.js              # Client-side logic
│   ├── crypto-client.js    # Encryption implementation
│   └── logo.png            # Branding
├── utils/
│   └── crypto.js           # Server-side crypto utilities
├── server.js               # Express + Socket.io server
├── package.json            # Dependencies
├── vercel.json             # Vercel configuration
└── README.md               # This file
```

## 🔧 Configuration

### File Expiry Options
- 30 seconds to 24 hours
- Never expire option
- Auto-removal when expired

### Connection Limits
- Max 3 concurrent downloads (configurable)
- Semaphore-based resource management
- Queue system for waiting transfers

### Room Settings
- Optional password protection
- Configurable expiry time
- Isolated file sharing

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - feel free to use this project for learning or production.

## 🙏 Acknowledgments

- WebRTC for P2P technology
- Socket.io for real-time communication
- Web Crypto API for encryption
- QRCode.js for QR code generation

---

**Built with ❤️ for secure, private file sharing**

