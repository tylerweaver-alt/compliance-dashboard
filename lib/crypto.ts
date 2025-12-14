/**
 * AES-256-GCM Encryption Helper for Secrets
 * Uses APP_MASTER_KEY environment variable (32 bytes / 64 hex chars)
 * 
 * Format: {iv_base64}.{authTag_base64}.{ciphertext_base64}
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the master key from environment
 * Must be 32 bytes (64 hex characters)
 */
function getMasterKey(): Buffer {
  const keyHex = process.env.APP_MASTER_KEY;
  
  if (!keyHex) {
    throw new Error('APP_MASTER_KEY environment variable is not set');
  }
  
  if (keyHex.length !== 64) {
    throw new Error('APP_MASTER_KEY must be 64 hex characters (32 bytes)');
  }
  
  return Buffer.from(keyHex, 'hex');
}

/**
 * Check if encryption is configured
 */
export function isEncryptionConfigured(): boolean {
  const keyHex = process.env.APP_MASTER_KEY;
  return Boolean(keyHex && keyHex.length === 64);
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * Returns format: {iv_base64}.{authTag_base64}.{ciphertext_base64}
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty string');
  }
  
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv.authTag.ciphertext (all base64)
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join('.');
}

/**
 * Decrypt a ciphertext string using AES-256-GCM
 * Expects format: {iv_base64}.{authTag_base64}.{ciphertext_base64}
 */
export function decryptSecret(ciphertext: string): string {
  if (!ciphertext) {
    throw new Error('Cannot decrypt empty string');
  }
  
  const parts = ciphertext.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format: expected iv.authTag.ciphertext');
  }
  
  const [ivB64, authTagB64, encryptedB64] = parts;
  
  const key = getMasterKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }
  
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`);
  }
  
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Generate a new random master key (for initial setup)
 * Returns 64 hex characters (32 bytes)
 */
export function generateMasterKey(): string {
  return randomBytes(32).toString('hex');
}

