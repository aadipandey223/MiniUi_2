# P2P File Sharing Website

A peer-to-peer file sharing application using WebRTC for direct browser-to-browser file transfers.

## Features
- 🚀 Direct P2P file transfer using WebRTC DataChannels
- 🔗 No file size limits (files stay in the browser)
- 🌐 Real-time peer connection status
- 📱 Responsive design
- 🔒 Secure transfers between peers

## Tech Stack
- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **P2P**: WebRTC DataChannels

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## How to Use

1. Open the website in two or more browser tabs/windows
2. Select a file to share from one tab
3. The file will appear in the available files list for other connected peers
4. Click "Download" from another peer to establish P2P connection and transfer the file

## Deployment

### Using Node.js
```bash
npm install
PORT=3000 npm start
```

### Using Docker
```bash
docker build -t p2p-sharing .
docker run -p 3000:3000 p2p-sharing
```

### Deploy to Cloud Platforms
- **Heroku**: Add Procfile and push to Heroku
- **Railway**: Connect GitHub repo
- **Render**: Deploy as Web Service
- **DigitalOcean**: Deploy as App Platform

## License
MIT
