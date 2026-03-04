const crypto = require('crypto');

const LEGACY_ALGORITHM = 'aes-256-cbc';
const LEGACY_IV_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION_PREFIX = 'v2';

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY is not set in environment variables');
  }
  return crypto.createHash('sha256').update(key).digest();
}

function encrypt(text) {
  if (text === null || text === undefined) return null;
  const textStr = String(text);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  let encrypted = cipher.update(textStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${VERSION_PREFIX}:${iv.toString('hex')}:${encrypted}:${authTag}`;
}

function decryptLegacy(ciphertext) {
  const parts = ciphertext.split(':');
  if (parts.length !== 2) return ciphertext;

  const iv = Buffer.from(parts[0], 'hex');
  if (iv.length !== LEGACY_IV_LENGTH) {
    throw new Error('Invalid legacy ciphertext IV length');
  }

  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, getKey(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function decrypt(ciphertext) {
  if (ciphertext === null || ciphertext === undefined) return null;

  const value = String(ciphertext);
  const parts = value.split(':');

  // New format: v2:<ivHex>:<cipherHex>:<authTagHex>
  if (parts.length === 4 && parts[0] === VERSION_PREFIX) {
    const iv = Buffer.from(parts[1], 'hex');
    if (iv.length !== IV_LENGTH) {
      throw new Error('Invalid ciphertext IV length');
    }

    const encrypted = parts[2];
    const authTag = Buffer.from(parts[3], 'hex');
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Invalid ciphertext authentication tag');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Backward compatibility for already stored values.
  return decryptLegacy(value);
}

module.exports = { encrypt, decrypt };
