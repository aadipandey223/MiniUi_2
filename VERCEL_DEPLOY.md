# Vercel Deployment Guide

## Quick Deploy to Vercel (FREE)

### Method 1: GitHub + Vercel (Recommended - Auto-updates!)

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Deploy on Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Sign in with GitHub
   - Click "New Project"
   - Import your GitHub repository
   - Click "Deploy"

3. **Auto-Updates:**
   - Every time you push to GitHub, Vercel automatically redeploys!
   - Just commit and push: `git add . && git commit -m "update" && git push`

---

### Method 2: Vercel CLI (Quick Deploy)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel
   ```
   - Follow the prompts
   - Vercel will give you a live URL instantly

3. **Update Later:**
   ```bash
   vercel --prod
   ```
   - Run this command anytime to deploy updates

---

## How Updates Work:

### With GitHub (Best Option):
1. Make changes to your code
2. Commit: `git add . && git commit -m "added new feature"`
3. Push: `git push`
4. **Vercel automatically deploys in 30 seconds!**

### With Vercel CLI:
1. Make changes to your code
2. Run: `vercel --prod`
3. New version is live!

---

## Alternative FREE Platforms (All support auto-updates):

### Railway.app
- Connect GitHub repo
- Auto-deploys on every push
- Better for WebSocket apps like yours
- **Recommended for P2P apps!**

### Render.com
- Connect GitHub repo
- Free tier with auto-deploy
- Good WebSocket support

### Fly.io
- Excellent WebSocket support
- Free tier available
- Deploy with `flyctl deploy`

---

## Important Notes:

⚠️ **Vercel Limitation:** 
- Vercel has **10-second serverless function timeout**
- May not work perfectly for long P2P connections
- Better alternatives: **Railway** or **Render**

✅ **Best FREE Option for Your P2P App:**
**Railway.app** - Perfect for WebSocket apps like yours!

1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub
3. "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway auto-detects Node.js and deploys!

**Every git push = automatic deployment!** 🚀

---

## Making Updates:

```bash
# 1. Make your changes to files
# 2. Test locally
npm start

# 3. Commit and push
git add .
git commit -m "added feature X"
git push

# 4. Platform auto-deploys (Railway/Render/Vercel)
# Your live site updates in ~1 minute!
```

---

## For Your OS Project:

You can continuously improve it:
- Add authentication
- Add file encryption
- Add chat features
- Add room/group support
- Add file history

Just code → commit → push → it's live! 🎉
