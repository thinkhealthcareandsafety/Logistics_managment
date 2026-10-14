const helmet = require('helmet');
const env = require('../config/env');

// The site's own websocket address (live updates) - some browsers don't count it as 'self'.
const ownSocket = env.clientUrl.replace(/^http/, 'ws');

/**
 * Browser-side protection on every response: no framing (clickjacking), no MIME
 * sniffing, HTTPS only, and a Content-Security-Policy that lets the page run only its
 * own scripts - so injected script can't run or send data anywhere. Product photos
 * come from many sites, hence https: images; videos are YouTube's privacy embed.
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'https:'],
      frameSrc: ['https://www.youtube-nocookie.com', 'https://www.youtube.com'],
      connectSrc: ["'self'", ownSocket],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  // Product photos and YouTube embeds are cross-origin; COEP would block them.
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
});

/**
 * MongoDB query operators ("$gt", "$where"...) and dotted paths have no business in
 * what a browser sends. Stripping them from body, query and route params means a
 * field like { "email": { "$ne": "" } } can't be smuggled into a database query.
 */
function stripOperators(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => stripOperators(v, depth + 1));
  if (Buffer.isBuffer(value)) return value;
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete value[key];
    } else {
      value[key] = stripOperators(value[key], depth + 1);
    }
  }
  return value;
}

function sanitizeInput(req, res, next) {
  if (req.body) stripOperators(req.body);
  if (req.query) stripOperators(req.query);
  if (req.params) stripOperators(req.params);
  next();
}

/** Escapes text for use inside a RegExp, so a search can't become a costly pattern. */
const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);

module.exports = { securityHeaders, sanitizeInput, stripOperators, escapeRegex };
