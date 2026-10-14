const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * userId -> { version, at }: each account's current session version, kept a few seconds
 * so busy pages don't read the user on every request. A password change or "sign out
 * everywhere" clears it at once (forgetSession), so old tokens stop working immediately.
 */
const sessions = new Map();
const SESSION_CACHE_MS = 30 * 1000;

async function currentVersion(userId) {
  const hit = sessions.get(userId);
  if (hit && Date.now() - hit.at < SESSION_CACHE_MS) return hit.version;
  const User = require('../models/User');
  const user = await User.findById(userId).select('tokenVersion').lean();
  const version = user ? user.tokenVersion || 0 : null;
  if (sessions.size > 1000) sessions.clear();
  sessions.set(userId, { version, at: Date.now() });
  return version;
}

function forgetSession(userId) {
  sessions.delete(String(userId));
}

/** The user id a token belongs to, or null when it's invalid, expired, revoked, or the account is gone. */
async function verifySession(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  if (typeof payload.sub !== 'string' || !/^[a-f0-9]{24}$/i.test(payload.sub)) return null;
  const version = await currentVersion(payload.sub);
  if (version === null || payload.v !== version) return null;
  return payload.sub;
}

const requireAuth = asyncHandler(async (req, res, next) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.[env.cookieName] || bearer;

  if (!token) {
    throw new ApiError(401, 'Authentication required');
  }
  const userId = await verifySession(token);
  if (!userId) throw new ApiError(401, 'Invalid or expired session');
  req.userId = userId;
  next();
});

module.exports = { requireAuth, verifySession, forgetSession };
