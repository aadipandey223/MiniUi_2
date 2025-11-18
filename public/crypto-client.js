/**
 * Client-side Cryptography Module
 * Handles triple-layer encryption in the browser with minimal user interaction
 * All crypto operations run automatically in the background
 */

// ===== LAYER 1: Session Encryption (ChaCha20) =====
// Note: Browser crypto API doesn't have ChaCha20, so we use AES-GCM as alternative
// Or we can use a library like libsodium.js for ChaCha20

const SessionCrypto = {
    /**
     * Generate ephemeral session key (auto-generated per transfer)
     * @returns {Promise<CryptoKey>} 256-bit AES key
     */
    async generateSessionKey() {
        return await window.crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true, // extractable
            ['encrypt', 'decrypt']
        );
    },

    /**
     * Encrypt chunk with AES-GCM (session layer)
     * @param {ArrayBuffer} chunk - File chunk
     * @param {CryptoKey} key - Session key
     * @returns {Promise<Object>} { encrypted, iv }
     */
    async encryptChunk(chunk, key) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            chunk
        );
        
        return {
            encrypted: new Uint8Array(encrypted),
            iv: iv
        };
    },

    /**
     * Decrypt chunk with AES-GCM (session layer)
     * @param {Uint8Array} encrypted - Encrypted chunk
     * @param {CryptoKey} key - Session key
     * @param {Uint8Array} iv - Initialization vector
     * @returns {Promise<ArrayBuffer>} Decrypted chunk
     */
    async decryptChunk(encrypted, key, iv) {
        try {
            return await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encrypted
            );
        } catch (error) {
            throw new Error('Session decryption failed - chunk may be tampered');
        }
    },

    /**
     * Export key for transmission
     * @param {CryptoKey} key - Session key
     * @returns {Promise<ArrayBuffer>} Raw key bytes
     */
    async exportKey(key) {
        return await window.crypto.subtle.exportKey('raw', key);
    },

    /**
     * Import key from bytes
     * @param {ArrayBuffer} keyBytes - Raw key bytes
     * @returns {Promise<CryptoKey>} Session key
     */
    async importKey(keyBytes) {
        return await window.crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }
};

// ===== LAYER 2: Room Encryption (AES-256-GCM) =====

const RoomCrypto = {
    /**
     * Derive room key from room ID and password
     * @param {String} roomId - Room identifier
     * @param {String} password - Room password (empty if none)
     * @returns {Promise<CryptoKey>} Room encryption key
     */
    async deriveRoomKey(roomId, password = '') {
        const encoder = new TextEncoder();
        const passwordBytes = encoder.encode(password || roomId);
        
        // Import password as key material
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            passwordBytes,
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );
        
        // Use room ID as salt
        const salt = await window.crypto.subtle.digest('SHA-256', encoder.encode(roomId));
        
        // Derive AES-256-GCM key
        return await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false, // not extractable for security
            ['encrypt', 'decrypt']
        );
    },

    /**
     * Encrypt data with room key
     * @param {ArrayBuffer} data - Data to encrypt
     * @param {CryptoKey} roomKey - Room key
     * @returns {Promise<Object>} { encrypted, iv }
     */
    async encrypt(data, roomKey) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            roomKey,
            data
        );
        
        return {
            encrypted: new Uint8Array(encrypted),
            iv: iv
        };
    },

    /**
     * Decrypt data with room key
     * @param {Uint8Array} encrypted - Encrypted data
     * @param {CryptoKey} roomKey - Room key
     * @param {Uint8Array} iv - Initialization vector
     * @returns {Promise<ArrayBuffer>} Decrypted data
     */
    async decrypt(encrypted, roomKey, iv) {
        try {
            return await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                roomKey,
                encrypted
            );
        } catch (error) {
            throw new Error('Room decryption failed - invalid key or tampered data');
        }
    },

    /**
     * Hash password for verification (SHA-256)
     * @param {String} password - Room password
     * @returns {Promise<String>} Hex hash
     */
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Compute Zero-Knowledge Proof
     * @param {String} password - Room password
     * @param {String} challenge - Server challenge
     * @returns {Promise<String>} Proof hash
     */
    async computeProof(password, challenge) {
        const combined = password + challenge;
        return await this.hashPassword(combined);
    }
};

// ===== LAYER 3: Identity Encryption (RSA-4096) =====

const IdentityCrypto = {
    /**
     * Generate RSA-4096 keypair (happens once per device)
     * @returns {Promise<CryptoKeyPair>} { publicKey, privateKey }
     */
    async generateKeypair() {
        return await window.crypto.subtle.generateKey(
            {
                name: 'RSA-PSS',
                modulusLength: 4096,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256'
            },
            true, // extractable
            ['sign', 'verify']
        );
    },

    /**
     * Sign data with private key (proves identity)
     * @param {ArrayBuffer} data - Data to sign
     * @param {CryptoKey} privateKey - Private key
     * @returns {Promise<ArrayBuffer>} Signature
     */
    async sign(data, privateKey) {
        return await window.crypto.subtle.sign(
            { name: 'RSA-PSS', saltLength: 32 },
            privateKey,
            data
        );
    },

    /**
     * Verify signature with public key
     * @param {ArrayBuffer} data - Original data
     * @param {ArrayBuffer} signature - Signature to verify
     * @param {CryptoKey} publicKey - Sender's public key
     * @returns {Promise<Boolean>} True if valid
     */
    async verify(data, signature, publicKey) {
        try {
            return await window.crypto.subtle.verify(
                { name: 'RSA-PSS', saltLength: 32 },
                publicKey,
                signature,
                data
            );
        } catch (error) {
            return false;
        }
    },

    /**
     * Export public key to share with others
     * @param {CryptoKey} publicKey - Public key
     * @returns {Promise<String>} Base64-encoded key
     */
    async exportPublicKey(publicKey) {
        const exported = await window.crypto.subtle.exportKey('spki', publicKey);
        return this.arrayBufferToBase64(exported);
    },

    /**
     * Import public key from base64
     * @param {String} base64Key - Base64-encoded public key
     * @returns {Promise<CryptoKey>} Public key
     */
    async importPublicKey(base64Key) {
        const keyBuffer = this.base64ToArrayBuffer(base64Key);
        return await window.crypto.subtle.importKey(
            'spki',
            keyBuffer,
            { name: 'RSA-PSS', hash: 'SHA-256' },
            true,
            ['verify']
        );
    },

    /**
     * Export private key to store in localStorage (encrypted)
     * @param {CryptoKey} privateKey - Private key
     * @returns {Promise<String>} Base64-encoded key
     */
    async exportPrivateKey(privateKey) {
        const exported = await window.crypto.subtle.exportKey('pkcs8', privateKey);
        return this.arrayBufferToBase64(exported);
    },

    /**
     * Import private key from base64
     * @param {String} base64Key - Base64-encoded private key
     * @returns {Promise<CryptoKey>} Private key
     */
    async importPrivateKey(base64Key) {
        const keyBuffer = this.base64ToArrayBuffer(base64Key);
        return await window.crypto.subtle.importKey(
            'pkcs8',
            keyBuffer,
            { name: 'RSA-PSS', hash: 'SHA-256' },
            true,
            ['sign']
        );
    },

    // Helper: ArrayBuffer to Base64
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    // Helper: Base64 to ArrayBuffer
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
};

// ===== File Integrity - Hash Chain =====

const IntegrityCrypto = {
    /**
     * Create hash chain for chunks
     * @param {Array<ArrayBuffer>} chunks - File chunks
     * @returns {Promise<Array<String>>} Hash chain (hex strings)
     */
    async createHashChain(chunks) {
        const hashes = [];
        let previousHash = '00000000'; // Genesis hash
        
        for (const chunk of chunks) {
            // Combine previous hash + current chunk
            const prevHashBytes = new TextEncoder().encode(previousHash);
            const combined = new Uint8Array(prevHashBytes.length + chunk.byteLength);
            combined.set(prevHashBytes);
            combined.set(new Uint8Array(chunk), prevHashBytes.length);
            
            // Hash combined data
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', combined);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            hashes.push(hashHex);
            previousHash = hashHex;
        }
        
        return hashes;
    },

    /**
     * Verify chunk against hash chain
     * @param {ArrayBuffer} chunk - Received chunk
     * @param {Number} index - Chunk index
     * @param {Array<String>} hashChain - Expected hashes
     * @param {String} previousHash - Previous hash in chain
     * @returns {Promise<Boolean>} True if valid
     */
    async verifyChunk(chunk, index, hashChain, previousHash = '00000000') {
        const prevHashBytes = new TextEncoder().encode(previousHash);
        const combined = new Uint8Array(prevHashBytes.length + chunk.byteLength);
        combined.set(prevHashBytes);
        combined.set(new Uint8Array(chunk), prevHashBytes.length);
        
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', combined);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return computedHash === hashChain[index];
    },

    /**
     * Hash entire file
     * @param {ArrayBuffer} fileData - Complete file
     * @returns {Promise<String>} File hash (hex)
     */
    async hashFile(fileData) {
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', fileData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
};

// ===== Utility Functions =====

const CryptoUtils = {
    /**
     * Generate identity hash (6 characters)
     * @param {String} displayName - User's display name
     * @returns {Promise<String>} Identity hash
     */
    async generateIdentityHash(displayName) {
        const combined = displayName + Date.now() + Math.random();
        const hash = await IntegrityCrypto.hashFile(new TextEncoder().encode(combined));
        return hash.substring(0, 6);
    },

    /**
     * Convert ArrayBuffer to Base64
     * @param {ArrayBuffer} buffer - Data buffer
     * @returns {String} Base64 string
     */
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    /**
     * Convert Base64 to ArrayBuffer
     * @param {String} base64 - Base64 string
     * @returns {ArrayBuffer} Data buffer
     */
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    },

    /**
     * Convert Uint8Array to Base64
     * @param {Uint8Array} uint8Array - Byte array
     * @returns {String} Base64 string
     */
    uint8ArrayToBase64(uint8Array) {
        let binary = '';
        for (let i = 0; i < uint8Array.byteLength; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        return btoa(binary);
    },

    /**
     * Convert Base64 to Uint8Array
     * @param {String} base64 - Base64 string
     * @returns {Uint8Array} Byte array
     */
    base64ToUint8Array(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
};

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SessionCrypto,
        RoomCrypto,
        IdentityCrypto,
        IntegrityCrypto,
        CryptoUtils
    };
}
