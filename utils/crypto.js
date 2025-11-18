/**
 * Cryptography Utility Module
 * Provides triple-layer encryption with minimal user interaction
 * All crypto operations happen automatically in the background
 */

const crypto = require('crypto');

/**
 * LAYER 1: Session Encryption (ChaCha20-Poly1305)
 * Ephemeral keys - generated per transfer, destroyed after
 */
class SessionCrypto {
    /**
     * Generate ephemeral session key (auto-generated, no user input)
     * @returns {Buffer} 256-bit random key
     */
    static generateSessionKey() {
        return crypto.randomBytes(32); // 256 bits
    }

    /**
     * Encrypt chunk with ChaCha20-Poly1305
     * @param {Buffer} chunk - File chunk to encrypt
     * @param {Buffer} key - Session key
     * @returns {Object} { encrypted, nonce, authTag }
     */
    static encryptChunk(chunk, key) {
        const nonce = crypto.randomBytes(12); // 96-bit nonce for ChaCha20
        const cipher = crypto.createCipheriv('chacha20-poly1305', key, nonce, {
            authTagLength: 16
        });
        
        const encrypted = Buffer.concat([
            cipher.update(chunk),
            cipher.final()
        ]);
        
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            nonce,
            authTag
        };
    }

    /**
     * Decrypt chunk with ChaCha20-Poly1305
     * @param {Buffer} encrypted - Encrypted chunk
     * @param {Buffer} key - Session key
     * @param {Buffer} nonce - Nonce used for encryption
     * @param {Buffer} authTag - Authentication tag
     * @returns {Buffer} Decrypted chunk
     */
    static decryptChunk(encrypted, key, nonce, authTag) {
        try {
            const decipher = crypto.createDecipheriv('chacha20-poly1305', key, nonce, {
                authTagLength: 16
            });
            
            decipher.setAuthTag(authTag);
            
            return Buffer.concat([
                decipher.update(encrypted),
                decipher.final()
            ]);
        } catch (error) {
            throw new Error('Decryption failed - chunk may be tampered');
        }
    }
}

/**
 * LAYER 2: Room Encryption (AES-256-GCM)
 * Shared secret - derived from room ID + optional password
 * User interaction: One-time password input (optional)
 */
class RoomCrypto {
    /**
     * Derive room key from room ID and password using PBKDF2
     * @param {String} roomId - Unique room identifier
     * @param {String} password - Optional room password (empty string if none)
     * @returns {Promise<Buffer>} 256-bit room key
     */
    static async deriveRoomKey(roomId, password = '') {
        return new Promise((resolve, reject) => {
            // Use room ID as salt for consistent key generation
            const salt = crypto.createHash('sha256').update(roomId).digest();
            
            // Derive key with 100,000 iterations (secure but fast enough)
            crypto.pbkdf2(password || roomId, salt, 100000, 32, 'sha256', (err, key) => {
                if (err) reject(err);
                else resolve(key);
            });
        });
    }

    /**
     * Encrypt data with AES-256-GCM (authenticated encryption)
     * @param {Buffer} data - Data to encrypt
     * @param {Buffer} roomKey - Room encryption key
     * @returns {Object} { encrypted, iv, authTag }
     */
    static encrypt(data, roomKey) {
        const iv = crypto.randomBytes(16); // 128-bit IV for AES-GCM
        const cipher = crypto.createCipheriv('aes-256-gcm', roomKey, iv);
        
        const encrypted = Buffer.concat([
            cipher.update(data),
            cipher.final()
        ]);
        
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv,
            authTag
        };
    }

    /**
     * Decrypt data with AES-256-GCM
     * @param {Buffer} encrypted - Encrypted data
     * @param {Buffer} roomKey - Room encryption key
     * @param {Buffer} iv - Initialization vector
     * @param {Buffer} authTag - Authentication tag
     * @returns {Buffer} Decrypted data
     */
    static decrypt(encrypted, roomKey, iv, authTag) {
        try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', roomKey, iv);
            decipher.setAuthTag(authTag);
            
            return Buffer.concat([
                decipher.update(encrypted),
                decipher.final()
            ]);
        } catch (error) {
            throw new Error('Room decryption failed - invalid key or tampered data');
        }
    }

    /**
     * Hash password for Zero-Knowledge Proof verification
     * @param {String} password - Room password
     * @returns {String} SHA-256 hash (hex)
     */
    static hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    /**
     * Generate Zero-Knowledge Proof challenge
     * @returns {String} Random challenge string
     */
    static generateChallenge() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Compute Zero-Knowledge Proof response
     * @param {String} password - Room password
     * @param {String} challenge - Server challenge
     * @returns {String} Proof hash
     */
    static computeProof(password, challenge) {
        const combined = password + challenge;
        return crypto.createHash('sha256').update(combined).digest('hex');
    }

    /**
     * Verify Zero-Knowledge Proof
     * @param {String} proof - Client's proof
     * @param {String} passwordHash - Stored password hash
     * @param {String} challenge - Original challenge
     * @returns {Boolean} True if proof valid
     */
    static verifyProof(proof, passwordHash, challenge) {
        // Reconstruct password from hash is impossible (SHA-256)
        // But we can verify: proof === hash(password + challenge)
        // Since we have passwordHash, we check if proof matches expected pattern
        // This is simplified - in production, use proper ZKP protocol
        const expectedProof = crypto.createHash('sha256')
            .update(passwordHash + challenge)
            .digest('hex');
        
        return crypto.timingSafeEqual(
            Buffer.from(proof, 'hex'),
            Buffer.from(expectedProof, 'hex')
        );
    }
}

/**
 * LAYER 3: Identity Encryption (RSA-4096 + Digital Signatures)
 * Asymmetric encryption - verifies sender identity
 * User interaction: NONE (auto-generated keypair on first visit)
 */
class IdentityCrypto {
    /**
     * Generate RSA-4096 keypair (happens once per user/device)
     * @returns {Object} { publicKey, privateKey } in PEM format
     */
    static generateKeypair() {
        return crypto.generateKeyPairSync('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });
    }

    /**
     * Sign data with private key (proves sender identity)
     * @param {Buffer} data - Data to sign
     * @param {String} privateKeyPem - Private key in PEM format
     * @returns {Buffer} Signature
     */
    static sign(data, privateKeyPem) {
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(data);
        sign.end();
        return sign.sign(privateKeyPem);
    }

    /**
     * Verify signature with public key
     * @param {Buffer} data - Original data
     * @param {Buffer} signature - Signature to verify
     * @param {String} publicKeyPem - Sender's public key
     * @returns {Boolean} True if signature valid
     */
    static verify(data, signature, publicKeyPem) {
        try {
            const verify = crypto.createVerify('RSA-SHA256');
            verify.update(data);
            verify.end();
            return verify.verify(publicKeyPem, signature);
        } catch (error) {
            return false;
        }
    }

    /**
     * Encrypt small data with public key (for key exchange)
     * @param {Buffer} data - Data to encrypt (max 446 bytes for RSA-4096)
     * @param {String} publicKeyPem - Recipient's public key
     * @returns {Buffer} Encrypted data
     */
    static encryptWithPublicKey(data, publicKeyPem) {
        return crypto.publicEncrypt(
            {
                key: publicKeyPem,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            data
        );
    }

    /**
     * Decrypt with private key
     * @param {Buffer} encrypted - Encrypted data
     * @param {String} privateKeyPem - Private key
     * @returns {Buffer} Decrypted data
     */
    static decryptWithPrivateKey(encrypted, privateKeyPem) {
        return crypto.privateDecrypt(
            {
                key: privateKeyPem,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            encrypted
        );
    }
}

/**
 * File Integrity - Blockchain-style hash chain
 * Verifies file hasn't been tampered during transfer
 */
class IntegrityCrypto {
    /**
     * Create hash chain for file chunks
     * @param {Array<Buffer>} chunks - File chunks
     * @returns {Array<String>} Hash chain (each hash includes previous)
     */
    static createHashChain(chunks) {
        const hashes = [];
        let previousHash = '0'; // Genesis hash
        
        for (const chunk of chunks) {
            const combined = Buffer.concat([
                Buffer.from(previousHash, 'hex'),
                chunk
            ]);
            
            const hash = crypto.createHash('sha256').update(combined).digest('hex');
            hashes.push(hash);
            previousHash = hash;
        }
        
        return hashes;
    }

    /**
     * Verify chunk against hash chain
     * @param {Buffer} chunk - Received chunk
     * @param {Number} index - Chunk index
     * @param {Array<String>} hashChain - Expected hash chain
     * @returns {Boolean} True if chunk valid
     */
    static verifyChunk(chunk, index, hashChain, previousHash = '0') {
        const combined = Buffer.concat([
            Buffer.from(previousHash, 'hex'),
            chunk
        ]);
        
        const computedHash = crypto.createHash('sha256').update(combined).digest('hex');
        
        return computedHash === hashChain[index];
    }

    /**
     * Generate file hash (SHA-256)
     * @param {Buffer} fileData - Complete file data
     * @returns {String} File hash (hex)
     */
    static hashFile(fileData) {
        return crypto.createHash('sha256').update(fileData).digest('hex');
    }
}

/**
 * Utility functions
 */
class CryptoUtils {
    /**
     * Generate unique room ID (9 characters)
     * @returns {String} Room ID
     */
    static generateRoomId() {
        // Generate exactly 9 alphanumeric characters
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let roomId = '';
        const randomBytes = crypto.randomBytes(9);
        for (let i = 0; i < 9; i++) {
            roomId += chars[randomBytes[i] % chars.length];
        }
        return roomId;
    }

    /**
     * Generate user identity hash (6 characters)
     * @param {String} displayName - User's display name
     * @returns {String} Identity hash
     */
    static generateIdentityHash(displayName) {
        const combined = displayName + Date.now() + Math.random();
        return crypto.createHash('sha256')
            .update(combined)
            .digest('hex')
            .substring(0, 6);
    }

    /**
     * Secure random string generation
     * @param {Number} length - Desired length
     * @returns {String} Random string
     */
    static randomString(length = 32) {
        return crypto.randomBytes(Math.ceil(length / 2))
            .toString('hex')
            .substring(0, length);
    }

    /**
     * Convert buffer to base64 for transmission
     * @param {Buffer} buffer - Data buffer
     * @returns {String} Base64 string
     */
    static bufferToBase64(buffer) {
        return buffer.toString('base64');
    }

    /**
     * Convert base64 to buffer
     * @param {String} base64 - Base64 string
     * @returns {Buffer} Data buffer
     */
    static base64ToBuffer(base64) {
        return Buffer.from(base64, 'base64');
    }
}

module.exports = {
    SessionCrypto,
    RoomCrypto,
    IdentityCrypto,
    IntegrityCrypto,
    CryptoUtils
};
