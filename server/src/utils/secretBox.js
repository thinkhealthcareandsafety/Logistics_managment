const crypto = require('crypto');
const env = require('../config/env');

/**
 * AES-256-GCM for secrets we must store (the Zoho refresh token grants read access to
 * the company's books - it never sits in the database as plain text).
 */
function key() {
  return crypto.createHash('sha256').update(env.zoho.tokenKey || `zoho:${env.jwtSecret}`).digest();
}

function seal(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

function open(sealed) {
  if (!sealed) return '';
  const [iv, tag, data] = String(sealed).split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Constant-time string comparison for secrets arriving in URLs. */
function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

module.exports = { seal, open, safeEqual };
