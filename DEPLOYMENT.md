# Deployment Guide

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open in browser:**
   - Navigate to `http://localhost:3000`
   - Open in multiple tabs/windows to test P2P functionality

---

## Production Deployment

### Option 1: Heroku

1. **Prerequisites:**
   - Install Heroku CLI
   - Create Heroku account

2. **Deploy:**
   ```bash
   heroku login
   heroku create your-app-name
   git push heroku main
   heroku open
   ```

3. **Configuration:**
   - No additional config needed
   - Heroku automatically detects Node.js

---

### Option 2: Railway

1. **Steps:**
   - Go to [railway.app](https://railway.app)
   - Click "Start a New Project"
   - Connect your GitHub repository
   - Railway auto-detects and deploys

2. **Environment:**
   - No variables needed for basic setup
   - Railway provides HTTPS automatically

---

### Option 3: Render

1. **Steps:**
   - Go to [render.com](https://render.com)
   - Create new "Web Service"
   - Connect GitHub repo
   - Use these settings:
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`

---

### Option 4: DigitalOcean App Platform

1. **Steps:**
   - Go to DigitalOcean App Platform
   - Create new app from GitHub
   - Select your repository
   - Configure:
     - **Run Command:** `npm start`
     - **HTTP Port:** 3000

---

### Option 5: Docker

1. **Build the image:**
   ```bash
   docker build -t p2p-sharing .
   ```

2. **Run the container:**
   ```bash
   docker run -p 3000:3000 p2p-sharing
   ```

3. **Using Docker Compose:**
   ```bash
   docker-compose up -d
   ```

---

### Option 6: VPS (Ubuntu/Debian)

1. **Install Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Install PM2:**
   ```bash
   sudo npm install -g pm2
   ```

3. **Clone and setup:**
   ```bash
   git clone <your-repo-url>
   cd p2p-file-sharing
   npm install
   ```

4. **Run with PM2:**
   ```bash
   pm2 start server.js --name p2p-sharing
   pm2 startup
   pm2 save
   ```

5. **Setup Nginx (optional):**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

---

## Important Notes

### WebRTC Requirements:
- **HTTPS Required:** For production, use HTTPS (most platforms provide it automatically)
- **STUN Servers:** Already configured in the code (Google's public STUN servers)
- **Firewall:** Ensure ports are open for WebRTC connections

### Security Considerations:
- Add rate limiting for production
- Consider adding authentication
- Implement file size limits if needed
- Add CORS restrictions for production

### Performance Tips:
- Use CDN for static assets in production
- Enable gzip compression
- Consider using TURN servers for better connectivity
- Monitor memory usage with large files

---

## Testing P2P Functionality

1. Open the app in **two different browser windows**
2. Share a file from one window
3. Download it from the other window
4. Check browser console for connection status

---

## Troubleshooting

**Files not appearing?**
- Check browser console for errors
- Ensure Socket.io connection is established
- Verify both peers are connected

**Download not starting?**
- Check WebRTC connection status
- Ensure HTTPS is enabled (required for WebRTC)
- Try different browsers
- Check firewall settings

**Slow transfer speeds?**
- Normal for first connection (ICE gathering)
- Check network quality
- Consider using TURN server for better routing

---

## Environment Variables (Optional)

Create `.env` file:
```
PORT=3000
NODE_ENV=production
```

---

## Support

For OS project documentation:
- Explain WebRTC technology
- Document P2P architecture
- Include network diagrams
- Describe signaling server role
