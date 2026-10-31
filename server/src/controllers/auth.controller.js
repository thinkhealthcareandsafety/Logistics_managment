const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { forgetSession } = require('../middleware/auth.middleware');

/** Wrong passwords in a row before the account locks, and for how long. */
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
// Compared against when the email is unknown, so "no such user" takes as long as
// "wrong password" and can't be told apart by timing.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-just-for-timing', 12);

/** The token carries the user's session version: bumping it ends every older session. */
function issueToken(user) {
  return jwt.sign({ sub: user._id.toString(), v: user.tokenVersion || 0 }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function setAuthCookie(res, token) {
  const { exp } = jwt.decode(token);
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: Math.max(0, exp * 1000 - Date.now()),
  });
}

const COMMON = ['password', 'demo@12345', '12345678', 'qwerty', 'thinkhealth', 'welcome', 'admin', 'letmein', 'changeme'];

/** Long enough, letters and numbers, not a well-known password, not the email itself. */
function checkPassword(password, email = '') {
  const p = String(password || '');
  if (p.length < 10) throw new ApiError(400, 'Password must be at least 10 characters');
  if (p.length > 128) throw new ApiError(400, 'Password is too long');
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) throw new ApiError(400, 'Password must contain both letters and numbers');
  const lower = p.toLowerCase();
  const local = String(email).toLowerCase().split('@')[0];
  if (COMMON.some((c) => lower.includes(c)) || (local.length >= 4 && lower.includes(local))) {
    throw new ApiError(400, 'That password is too easy to guess - choose a different one');
  }
}

const str = (v) => (typeof v === 'string' ? v : '');

/** Checks and creates a staff account - shared by sign-up and "Add a colleague". */
async function createAccount(body) {
  const name = str(body.name).trim();
  const email = str(body.email).trim().toLowerCase();
  const password = str(body.password);
  const company = str(body.company).trim();
  if (!name || !email || !password) {
    throw new ApiError(400, 'name, email and password are required');
  }
  checkPassword(password, email);

  const domain = email.split('@')[1] || '';
  if (!env.signupAllowedDomains.includes(domain)) {
    throw new ApiError(
      403,
      `Accounts are for ThinkHealth staff only. Use a ${env.signupAllowedDomains.map((d) => `@${d}`).join(' or ')} work email.`
    );
  }

  if (await User.findOne({ email })) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  return User.create({ name: name.slice(0, 100), email, passwordHash, company: company.slice(0, 100) || undefined });
}

const register = asyncHandler(async (req, res) => {
  // Accounts open the shared stock, invoices and customer details - sign-up stays shut
  // unless the server explicitly allows it (SIGNUP_ENABLED=true) for a new colleague.
  if (!env.signupEnabled) {
    throw new ApiError(
      403,
      'New accounts are added by a teammate: someone already signed in opens Profile → Team → Add a colleague.'
    );
  }
  const user = await createAccount(req.body);
  logger.info(`New account created: ${user.email} from ${req.ip}`);

  const token = issueToken(user);
  setAuthCookie(res, token);
  res.status(201).json({ token, user: user.toSafeJSON() });
});

const login = asyncHandler(async (req, res) => {
  const email = str(req.body.email).trim().toLowerCase();
  const password = str(req.body.password);
  if (!email || !password) {
    throw new ApiError(400, 'email and password are required');
  }

  const user = await User.findOne({ email });
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    logger.warn(`Failed sign-in for unknown email ${email} from ${req.ip}`);
    throw new ApiError(401, 'Invalid email or password');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw new ApiError(423, `Too many wrong passwords - this account is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}`);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    user.failedLogins = (user.failedLogins || 0) + 1;
    if (user.failedLogins >= MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failedLogins = 0;
      logger.warn(`Account ${email} locked for ${LOCK_MINUTES} min after ${MAX_FAILED_LOGINS} wrong passwords (last from ${req.ip})`);
    } else {
      logger.warn(`Wrong password for ${email} from ${req.ip} (${user.failedLogins}/${MAX_FAILED_LOGINS})`);
    }
    await user.save();
    throw new ApiError(401, 'Invalid email or password');
  }

  user.failedLogins = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  user.lastLoginIp = String(req.ip || '').slice(0, 64);
  await user.save();
  logger.info(`Signed in: ${email} from ${req.ip}`);

  const token = issueToken(user);
  setAuthCookie(res, token);
  res.json({ token, user: user.toSafeJSON() });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(env.cookieName);
  res.status(204).send();
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ user: user.toSafeJSON() });
});

/** Ends every session (this one gets a fresh token) - after a password change, or on request. */
async function endOtherSessions(user, res) {
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  forgetSession(user._id);
  const token = issueToken(user);
  setAuthCookie(res, token);
  return token;
}

const changePassword = asyncHandler(async (req, res) => {
  const currentPassword = str(req.body.currentPassword);
  const newPassword = str(req.body.newPassword);
  const user = await User.findById(req.userId);
  if (!user) throw new ApiError(404, 'User not found');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ApiError(400, 'Current password is wrong');
  }
  checkPassword(newPassword, user.email);
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw new ApiError(400, 'Choose a password different from the current one');
  }
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordChangedAt = new Date();
  const token = await endOtherSessions(user, res);
  logger.info(`Password changed for ${user.email} from ${req.ip} - other sessions signed out`);
  res.json({ token, user: user.toSafeJSON() });
});

const logoutEverywhere = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new ApiError(404, 'User not found');
  const token = await endOtherSessions(user, res);
  logger.info(`${user.email} signed out all other sessions from ${req.ip}`);
  res.json({ token, user: user.toSafeJSON() });
});

/** Everyone with an account - the Team list on the Profile page. */
const listTeam = asyncHandler(async (req, res) => {
  const users = await User.find({}, 'name email createdAt lastLoginAt').sort({ createdAt: 1 }).lean();
  res.json({
    team: users.map((u) => ({ id: u._id, name: u.name, email: u.email, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt })),
  });
});

/**
 * A signed-in teammate adds a colleague - public sign-up stays off. The colleague signs
 * in with the password they're given and changes it on their Profile page.
 */
const addTeammate = asyncHandler(async (req, res) => {
  const by = await User.findById(req.userId, 'email');
  const user = await createAccount(req.body);
  logger.info(`Account ${user.email} added by ${by?.email || req.userId} from ${req.ip}`);
  res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, createdAt: user.createdAt, lastLoginAt: null } });
});

module.exports = { register, login, logout, me, changePassword, logoutEverywhere, checkPassword, listTeam, addTeammate };
