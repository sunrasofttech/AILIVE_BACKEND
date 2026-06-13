const crypto = require('crypto');

const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || 'default_super_secure_vo_biz_encryption_key_2026';

// Derive a 32-byte key using SHA-256 hash
const KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Encrypt a text string using AES-256-GCM
 * @param {string} text 
 * @returns {string} iv:ciphertext:tag
 */
function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypt a text string using AES-256-GCM
 * @param {string} encryptedText 
 * @returns {string} decrypted text
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    return encryptedText; // Graceful fallback: treat as plaintext
  }
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const authTag = Buffer.from(parts[2], 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return encryptedText; // Fallback to plaintext if decryption error occurs
  }
}

module.exports = {
  encrypt,
  decrypt,
};
