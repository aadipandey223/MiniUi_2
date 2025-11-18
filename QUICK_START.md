# 🚀 Quick Start Guide

## Local Development

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open in browser
http://localhost:3000
```

## Deploy to Railway (Fastest)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Deploy to Railway"
   git push origin main
   ```

2. **Deploy**
   - Go to [railway.app](https://railway.app)
   - Click "Start a New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Click "Deploy Now"

3. **Done!** 🎉
   - Railway generates a URL automatically
   - Your app is live in ~2 minutes

## Key Features

### 🔐 Security
- Triple-layer encryption (AES-256-GCM + RSA-OAEP)
- Private rooms with password protection
- Zero-knowledge authentication
- End-to-end encrypted transfers

### 📁 File Sharing
- Direct P2P transfers (no server storage)
- No file size limits
- Multiple file upload
- Batch download
- Auto-expiring files (30 sec to 24 hours)

### 🎯 OS Concepts
- CPU Scheduling (FCFS, SJF, Priority)
- Semaphore-based connection limiting
- Download queue management
- Real-time performance metrics

### 🎨 UI/UX
- Modern glassmorphism design
- Responsive mobile-first
- Dark theme + Incognito mode
- Real-time speed graphs
- QR code sharing

## Usage

### Share Files Globally
1. Open the app
2. Drag & drop files or click "Select Files"
3. Set expiry time
4. Files appear for all connected peers
5. Others click "Download" to receive

### Create Private Room
1. Click "Create" button
2. Set optional password (or use "Generate & Copy")
3. Set room expiry
4. Share room link or QR code
5. Files shared only within the room

### Join Private Room
1. Click "Join" button
2. Enter room ID
3. Enter password (if required)
4. Start sharing files securely

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **P2P**: WebRTC DataChannels
- **Encryption**: Web Crypto API
- **Real-time**: Socket.io

## Documentation

- `README.md` - Full documentation
- `RAILWAY_DEPLOY.md` - Railway deployment guide
- `VERCEL_DEPLOY.md` - Vercel deployment guide
- `DEPLOYMENT_CHECKLIST.md` - Pre-deployment checklist
- `OS_CONCEPTS_IMPLEMENTATION.md` - OS concepts explained
- `PROJECT_STRUCTURE.md` - Code structure

## Support

- Check documentation files
- Review console logs for errors
- Test in multiple browsers
- Verify WebRTC compatibility

---

**Everything is ready! Deploy and share! 🚀**
