const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Sign-in / sign-up / password change: few enough per address that guessing passwords
// is hopeless (accounts also lock after 5 wrong passwords - see auth.controller).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later.' },
});

const publicTrackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many tracking lookups, please try again later.' },
});

// Feedback submission is public and writes to the database, so it's tighter than a
// read-only tracking lookup - enough for a customer to correct a typo, not enough to
// spray ratings across guessed AWB numbers.
const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many feedback submissions, please try again later.' },
});

// Sales enquiries: generous enough that a genuine prospect who mistypes their email
// isn't locked out, tight enough that the form isn't a spam relay.
const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many enquiries from this address, please email us directly.' },
});

// Actions that spend a paid API (label scan, photo search, sync everything, Zoho sync):
// a handful an hour is plenty for a person and stops a script from draining the quotas.
const costlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many of these requests - please wait a while and try again.' },
});

// Delivery receipts: public and they carry photos, so few per address - enough for a
// receiver whose upload failed to try again, not enough to flood the database.
const receiptLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many receipt submissions from this connection - please try again later.' },
});

module.exports = { apiLimiter, authLimiter, publicTrackingLimiter, feedbackLimiter, leadLimiter, costlyLimiter, receiptLimiter };
