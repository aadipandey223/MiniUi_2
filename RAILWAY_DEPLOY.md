# 🚂 Railway Deployment Guide

This guide will help you deploy your Secure Share P2P File Transfer application to Railway.

## Prerequisites

- GitHub account
- Railway account (sign up at [railway.app](https://railway.app))
- Your code pushed to a GitHub repository

## Deployment Steps

### Method 1: Deploy from GitHub (Recommended)

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Ready for Railway deployment"
   git push origin main
   ```

2. **Go to Railway**
   - Visit [railway.app](https://railway.app)
   - Click "Start a New Project"
   - Select "Deploy from GitHub repo"

3. **Connect GitHub Repository**
   - Authorize Railway to access your GitHub
   - Select your repository
   - Click "Deploy Now"

4. **Configure Environment (Optional)**
   - Railway will auto-detect Node.js
   - No environment variables needed for basic setup
   - If you want to set a custom port:
     - Go to Variables tab
     - Add `PORT` (Railway sets this automatically)

5. **Generate Domain**
   - Go to Settings tab
   - Click "Generate Domain"
   - Your app will be available at: `https://your-app.up.railway.app`

### Method 2: Deploy with Railway CLI

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**
   ```bash
   railway login
   ```

3. **Initialize Project**
   ```bash
   railway init
   ```

4. **Deploy**
   ```bash
   railway up
   ```

5. **Open in Browser**
   ```bash
   railway open
   ```

## Configuration

### Automatic Detection
Railway automatically detects:
- ✅ Node.js project (from `package.json`)
- ✅ Start command (`npm start`)
- ✅ Port configuration (from `process.env.PORT`)

### Files Used by Railway
- `package.json` - Dependencies and start script
- `Procfile` - Process type (web: node server.js)
- `server.js` - Main application file

## Environment Variables

Railway automatically provides:
- `PORT` - The port your app should listen on
- `RAILWAY_ENVIRONMENT` - Current environment (production/staging)

No additional environment variables are required for this application.

## Post-Deployment

### 1. Test Your Deployment
- Open the generated Railway URL
- Test file sharing between multiple browser tabs
- Create a private room and test password protection
- Verify WebRTC connections work

### 2. Custom Domain (Optional)
- Go to Settings → Domains
- Click "Custom Domain"
- Add your domain and configure DNS

### 3. Monitor Your App
- View logs in Railway dashboard
- Check deployment status
- Monitor resource usage

## Troubleshooting

### Build Fails
```bash
# Check logs in Railway dashboard
# Ensure all dependencies are in package.json
npm install
```

### App Crashes
```bash
# Check Railway logs
# Verify PORT is correctly configured in server.js
```

### WebRTC Not Working
- Ensure HTTPS is enabled (Railway provides this automatically)
- Check browser console for errors
- Verify STUN servers are accessible

## Railway Features

### Automatic Deployments
- Every push to main branch triggers a new deployment
- Zero-downtime deployments
- Automatic rollback on failure

### Scaling
- Railway handles scaling automatically
- No configuration needed for basic usage

### Logs
```bash
# View logs via CLI
railway logs

# Or view in Railway dashboard
```

## Cost

- **Free Tier**: $5 credit per month
- **Pro Plan**: $20/month for more resources
- This app should run comfortably on the free tier

## Useful Commands

```bash
# View project info
railway status

# Open app in browser
railway open

# View logs
railway logs

# Link to existing project
railway link

# Run commands in Railway environment
railway run node server.js
```

## Support

- Railway Docs: [docs.railway.app](https://docs.railway.app)
- Railway Discord: [discord.gg/railway](https://discord.gg/railway)
- GitHub Issues: Report issues in your repository

## Next Steps

After deployment:
1. ✅ Test all features (file sharing, rooms, encryption)
2. ✅ Share your Railway URL with users
3. ✅ Monitor logs for any issues
4. ✅ Consider adding a custom domain
5. ✅ Set up monitoring/alerts if needed

---

**Your app is now live on Railway! 🎉**

Share your Railway URL and start using secure P2P file sharing!
