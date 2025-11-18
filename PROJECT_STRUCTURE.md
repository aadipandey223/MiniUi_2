# 📁 Project Structure Documentation

Complete guide to every file in this P2P File Sharing Application.

---

## 🎯 Project Overview

**Name**: Secure Share - P2P File Sharing  
**Type**: Real-time peer-to-peer file transfer application  
**Tech Stack**: Node.js, Express, Socket.io, WebRTC, Web Crypto API  
**Security**: Triple-layer encryption (AES-256-GCM + RSA-4096)

---

## 📂 Root Directory Files

### Core Application Files

#### `server.js`
**Purpose**: Main server application  
**Why it exists**: 
- Handles WebRTC signaling between peers
- Manages Socket.io connections for real-time communication
- Implements room management with encryption
- Provides Zero-Knowledge Proof authentication
- Coordinates peer discovery and file sharing

**Key Features**:
- Express HTTP server
- Socket.io WebSocket server
- Room creation and management
- Password verification (ZKP)
- Peer connection signaling
- File metadata broadcasting

**Dependencies**: express, socket.io, uuid, crypto

---

#### `package.json`
**Purpose**: Node.js project configuration  
**Why it exists**:
- Defines project metadata (name, version, description)
- Lists all dependencies and their versions
- Specifies npm scripts (start, dev)
- Configures project settings

**Key Dependencies**:
- `express` - Web server framework
- `socket.io` - Real-time bidirectional communication
- `cors` - Cross-Origin Resource Sharing
- `crypto-js` - Cryptographic functions
- `libsodium-wrappers` - Advanced cryptography
- `node-forge` - TLS and crypto toolkit
- `qrcode` - QR code generation for room sharing
- `uuid` - Unique identifier generation

**Dev Dependencies**:
- `nodemon` - Auto-restart server on file changes

---

#### `package-lock.json`
**Purpose**: Dependency version lock file  
**Why it exists**:
- Ensures consistent dependency versions across installations
- Records exact version tree of all dependencies
- Prevents "works on my machine" issues
- Speeds up npm install

**Auto-generated**: Yes, by npm  
**Should commit**: Yes, for reproducible builds

---

### Configuration Files

#### `.gitignore`
**Purpose**: Git ignore rules  
**Why it exists**:
- Prevents committing unnecessary files to Git
- Excludes node_modules (large, auto-generated)
- Excludes environment files (.env)
- Excludes OS-specific files (.DS_Store)
- Keeps repository clean and small

**Common Exclusions**:
```
node_modules/
.env
.DS_Store
*.log
```

---

#### `vercel.json`
**Purpose**: Vercel deployment configuration  
**Why it exists**:
- Configures how Vercel builds and serves the app
- Defines build settings for Node.js server
- Sets up routing rules for Socket.io
- Specifies static file serving

**Key Settings**:
- Build configuration for server.js
- Static file serving for public/
- WebSocket routing for Socket.io

**Platform**: Vercel (serverless deployment)

---

#### `Dockerfile`
**Purpose**: Docker container configuration  
**Why it exists**:
- Defines how to build a Docker image
- Specifies Node.js version (18-alpine)
- Sets up working directory
- Installs dependencies
- Exposes port 3000
- Defines startup command

**Use Case**: Containerized deployment  
**Benefits**: Consistent environment, easy scaling

---

#### `docker-compose.yml`
**Purpose**: Docker Compose orchestration  
**Why it exists**:
- Simplifies Docker container management
- Defines service configuration
- Sets environment variables
- Configures port mapping
- Enables one-command deployment

**Command**: `docker-compose up`

---

#### `Procfile`
**Purpose**: Heroku deployment configuration  
**Why it exists**:
- Tells Heroku how to start the application
- Defines process types (web, worker, etc.)
- Specifies startup command

**Content**: `web: node server.js`  
**Platform**: Heroku

---

### Documentation Files

#### `README.md`
**Purpose**: Main project documentation  
**Why it exists**:
- Provides project overview and description
- Lists features and capabilities
- Explains installation and setup
- Shows usage instructions
- Documents deployment options
- Serves as entry point for new users/developers

**Audience**: Users, developers, contributors

---

#### `DEPLOYMENT.md`
**Purpose**: Deployment guide  
**Why it exists**:
- Step-by-step deployment instructions
- Platform-specific guides (Heroku, Vercel, Docker)
- Environment variable configuration
- Troubleshooting common issues
- Production best practices

**Audience**: DevOps, deployment engineers

---

#### `VERCEL_DEPLOY.md`
**Purpose**: Vercel-specific deployment guide  
**Why it exists**:
- Detailed Vercel deployment steps
- Configuration explanations
- Vercel CLI usage
- Domain setup
- Environment variables for Vercel

**Audience**: Developers deploying to Vercel

---

#### `TESTING_GUIDE.md`
**Purpose**: Testing procedures and guidelines  
**Why it exists**:
- Documents how to test the application
- Lists test scenarios
- Explains expected behavior
- Provides troubleshooting steps
- Ensures quality assurance

**Audience**: QA testers, developers

---

### Assets

#### `2.png`
**Purpose**: Application logo/icon  
**Why it exists**:
- Brand identity
- Visual recognition
- Used in UI header
- Favicon source

**Format**: PNG image  
**Usage**: Displayed in navigation bar

---

## 📂 `/public` Directory

Frontend files served to the browser.

---

#### `public/index.html`
**Purpose**: Main HTML structure  
**Why it exists**:
- Defines the application's DOM structure
- Contains all UI elements (buttons, modals, sections)
- Links CSS and JavaScript files
- Provides semantic HTML markup
- Includes meta tags for SEO and mobile

**Key Sections**:
- Navigation header with room controls
- Hero section with stats
- File upload area
- Available files list
- Active transfers display
- Download queue
- Performance monitoring
- Modals (create room, join room, room link)

**Dependencies**: styles.css, app.js, crypto-client.js, socket.io

---

#### `public/app.js`
**Purpose**: Main client-side application logic  
**Why it exists**:
- Handles all user interactions
- Manages WebRTC peer connections
- Implements file transfer logic
- Handles Socket.io events
- Manages UI updates and rendering
- Implements download queue and scheduling
- Handles encryption/decryption during transfers

**Key Features**:
- Socket.io client connection
- WebRTC DataChannel management
- File upload/download handling
- Room management (create, join, leave)
- Triple-layer encryption integration
- Real-time UI updates
- Performance monitoring
- Download queue with scheduling algorithms

**Size**: ~2,200 lines  
**Complexity**: High (core application logic)

---

#### `public/crypto-client.js`
**Purpose**: Client-side cryptography implementation  
**Why it exists**:
- Implements triple-layer encryption
- Provides Web Crypto API wrappers
- Handles key generation and management
- Implements encryption/decryption functions
- Provides signature generation/verification
- Ensures security in the browser

**Encryption Layers**:
1. **Session Crypto** (AES-256-GCM) - Ephemeral keys per transfer
2. **Room Crypto** (AES-256-GCM) - Room-specific encryption
3. **Identity Crypto** (RSA-4096) - Digital signatures

**Key Functions**:
- `SessionCrypto.generateSessionKey()`
- `SessionCrypto.encryptChunk()`
- `SessionCrypto.decryptChunk()`
- `RoomCrypto.deriveRoomKey()`
- `RoomCrypto.encrypt()`
- `RoomCrypto.decrypt()`
- `IdentityCrypto.generateKeypair()`
- `IdentityCrypto.sign()`
- `IdentityCrypto.verify()`
- `IntegrityCrypto.createHashChain()`
- `CryptoUtils.*` (helper functions)

**Security**: Military-grade encryption

---

#### `public/styles.css`
**Purpose**: Application styling and design  
**Why it exists**:
- Defines visual appearance
- Implements responsive design
- Provides animations and transitions
- Creates dark theme with accent colors
- Ensures consistent UI/UX
- Implements incognito mode styling

**Key Features**:
- CSS variables for theming
- Flexbox/Grid layouts
- Smooth animations (pulse, shimmer, fade)
- Responsive breakpoints
- Dark theme with blue/green accents
- Gold theme for incognito mode
- Encryption status indicators
- Progress bar animations

**Size**: ~1,500+ lines  
**Design**: Modern, clean, professional

---

#### `public/2.png` & `public/logo.png`
**Purpose**: Application branding assets  
**Why it exists**:
- Visual identity
- Logo display in UI
- Favicon
- Brand consistency

**Format**: PNG images  
**Usage**: Navigation bar, branding

---

## 📂 `/utils` Directory

Server-side utility modules.

---

#### `utils/crypto.js`
**Purpose**: Server-side cryptography utilities  
**Why it exists**:
- Implements server-side crypto operations
- Provides password hashing
- Implements Zero-Knowledge Proof
- Generates room IDs and keys
- Handles encryption for server operations

**Key Classes**:
- `SessionCrypto` - ChaCha20-Poly1305 encryption
- `RoomCrypto` - AES-256-GCM + PBKDF2 key derivation
- `IdentityCrypto` - RSA-4096 keypair management
- `IntegrityCrypto` - Hash chain verification
- `CryptoUtils` - Helper functions

**Key Functions**:
- `RoomCrypto.hashPassword()` - SHA-256 password hashing
- `RoomCrypto.generateChallenge()` - ZKP challenge generation
- `RoomCrypto.verifyProof()` - ZKP verification
- `CryptoUtils.generateRoomId()` - Unique room ID generation
- `CryptoUtils.generateIdentityHash()` - User identity hashing

**Security**: Zero-knowledge authentication

---

## 📂 `/node_modules` Directory

**Purpose**: Installed npm packages  
**Why it exists**:
- Contains all project dependencies
- Auto-generated by `npm install`
- Required for application to run

**Should commit**: No (excluded in .gitignore)  
**Size**: Large (~100+ MB)  
**Regenerate**: `npm install`

---

## 📂 `.git` Directory

**Purpose**: Git version control metadata  
**Why it exists**:
- Stores Git repository data
- Tracks file changes and history
- Manages branches and commits
- Enables version control

**Auto-generated**: Yes, by `git init`  
**Should modify**: No (managed by Git)

---

## 🗂️ File Organization Summary

### By Purpose

#### **Core Application** (Must Have)
- `server.js` - Backend server
- `public/app.js` - Frontend logic
- `public/crypto-client.js` - Client crypto
- `utils/crypto.js` - Server crypto
- `public/index.html` - UI structure
- `public/styles.css` - UI styling

#### **Configuration** (Must Have)
- `package.json` - Dependencies
- `package-lock.json` - Version lock
- `.gitignore` - Git exclusions

#### **Deployment** (Platform-Specific)
- `Dockerfile` - Docker deployment
- `docker-compose.yml` - Docker orchestration
- `Procfile` - Heroku deployment
- `vercel.json` - Vercel deployment

#### **Documentation** (Helpful)
- `README.md` - Main docs
- `DEPLOYMENT.md` - Deploy guide
- `VERCEL_DEPLOY.md` - Vercel guide
- `TESTING_GUIDE.md` - Testing guide
- `PROJECT_STRUCTURE.md` - This file

#### **Assets** (Visual)
- `2.png` - Logo
- `public/logo.png` - Logo variant

---

## 🔄 File Dependencies

### Dependency Flow

```
index.html
    ├── styles.css (styling)
    ├── crypto-client.js (encryption)
    └── app.js (main logic)
        └── socket.io (from server)

server.js
    ├── express (web server)
    ├── socket.io (WebSocket)
    └── utils/crypto.js (server crypto)

package.json
    └── defines all npm dependencies
```

---

## 📊 File Statistics

### Code Files
- **Total Lines**: ~5,000+
- **JavaScript**: ~3,500 lines
- **CSS**: ~1,500 lines
- **HTML**: ~500 lines

### File Count
- **Source Files**: 8
- **Config Files**: 6
- **Documentation**: 5
- **Assets**: 2
- **Total**: 21 files (excluding node_modules)

---

## 🎯 Critical Files (Cannot Delete)

1. `server.js` - Backend won't work
2. `public/app.js` - Frontend won't work
3. `public/crypto-client.js` - Encryption won't work
4. `public/index.html` - No UI
5. `public/styles.css` - No styling
6. `utils/crypto.js` - Server crypto won't work
7. `package.json` - Can't install dependencies

---

## 🔧 Optional Files (Can Delete)

1. `DEPLOYMENT.md` - Deployment still works
2. `VERCEL_DEPLOY.md` - Vercel still works
3. `TESTING_GUIDE.md` - Testing still works
4. `Dockerfile` - If not using Docker
5. `docker-compose.yml` - If not using Docker
6. `Procfile` - If not using Heroku
7. `vercel.json` - If not using Vercel

---

## 🚀 Deployment Files by Platform

### Heroku
- `Procfile` ✅
- `package.json` ✅

### Vercel
- `vercel.json` ✅
- `package.json` ✅

### Docker
- `Dockerfile` ✅
- `docker-compose.yml` ✅
- `package.json` ✅

### Railway / DigitalOcean
- `package.json` ✅ (auto-detect)

---

## 📝 Notes

### File Naming Conventions
- **Uppercase**: Documentation (README.md, DEPLOYMENT.md)
- **Lowercase**: Code files (server.js, app.js)
- **kebab-case**: Config files (docker-compose.yml)
- **camelCase**: JavaScript variables/functions

### File Locations
- **Root**: Server files and configs
- **public/**: Client-side files (served to browser)
- **utils/**: Server-side utilities
- **node_modules/**: Dependencies (auto-generated)

### File Sizes
- **Small** (<10 KB): Config files
- **Medium** (10-100 KB): Most code files
- **Large** (>100 KB): app.js, styles.css
- **Huge** (>1 MB): node_modules

---

## 🎓 Understanding the Architecture

### Client-Server Model
```
Browser (Client)
    ├── index.html (UI)
    ├── app.js (logic)
    ├── crypto-client.js (encryption)
    └── styles.css (design)
    
Server (Node.js)
    ├── server.js (signaling)
    └── utils/crypto.js (server crypto)
    
P2P Connection (WebRTC)
    └── Direct browser-to-browser transfer
```

### Data Flow
```
1. User uploads file → app.js
2. File encrypted → crypto-client.js
3. Metadata sent to server → server.js
4. Server broadcasts to peers → socket.io
5. Peer requests file → WebRTC signaling
6. Direct P2P transfer → WebRTC DataChannel
7. File decrypted → crypto-client.js
8. File downloaded → browser
```

---

## ✅ Checklist for New Developers

- [ ] Read `README.md` first
- [ ] Understand `package.json` dependencies
- [ ] Review `server.js` for backend logic
- [ ] Study `public/app.js` for frontend logic
- [ ] Examine `crypto-client.js` for encryption
- [ ] Check `public/index.html` for UI structure
- [ ] Review `public/styles.css` for styling
- [ ] Read deployment docs for your platform

---

## 🎉 Summary

This project is a **production-ready** P2P file sharing application with:
- ✅ Clean file organization
- ✅ Comprehensive documentation
- ✅ Multiple deployment options
- ✅ Military-grade encryption
- ✅ Modern UI/UX
- ✅ Real-time communication

Every file serves a specific purpose and contributes to the overall functionality.

---

*Last Updated: Today*  
*Total Files: 21 (excluding node_modules)*  
*Status: Production Ready 🚀*
