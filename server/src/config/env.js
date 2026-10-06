require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  // On Render, RENDER_EXTERNAL_URL is the site's public address (front end and API are
  // served together there), so links in emails and redirects work without extra setup.
  clientUrl: (process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173').replace(/\/$/, ''),

  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/logistics-tracker'),

  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieName: process.env.COOKIE_NAME || 'lt_token',

  // This is an internal ops tool: a signed-in user sees the shared sales pipeline
  // (leads with names, emails, phones). Open sign-up would hand that to anyone, so
  // accounts can only be created with an email on one of these domains.
  signupAllowedDomains: (process.env.SIGNUP_ALLOWED_DOMAINS || 'thinkhealth.in')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean),

  trackingMore: {
    apiKey: process.env.TRACKINGMORE_API_KEY || '',
    baseUrl: process.env.TRACKINGMORE_BASE_URL || 'https://api.trackingmore.com/v4',
  },

  refresh: {
    cron: process.env.REFRESH_CRON || '*/15 * * * *',
    concurrency: Number(process.env.REFRESH_CONCURRENCY) || 5,
    minIntervalMinutes: Number(process.env.MIN_REFRESH_INTERVAL_MINUTES) || 10,
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'notifications@example.com',
  },

  gupshup: {
    apiKey: process.env.GUPSHUP_API_KEY || '',
    sourceNumber: process.env.GUPSHUP_SOURCE_NUMBER || '',
    appName: process.env.GUPSHUP_APP_NAME || '',
  },

  // Where this API is reachable from outside - Zoho redirects back to it after sign-in
  // and calls its webhook. In development that's this machine.
  serverUrl: (
    process.env.SERVER_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${Number(process.env.PORT) || 5000}`
  ).replace(/\/$/, ''),

  // Zoho Books stock sync. Create a "Server-based Application" at api-console.zoho.in
  // (or .com/.eu... for your data centre) and register the redirect URI shown in the app.
  zoho: {
    clientId: process.env.ZOHO_CLIENT_ID || '',
    clientSecret: process.env.ZOHO_CLIENT_SECRET || '',
    dc: (process.env.ZOHO_DC || 'in').toLowerCase(),
    accountsUrl: process.env.ZOHO_ACCOUNTS_URL || '',
    redirectUri: process.env.ZOHO_REDIRECT_URI || '',
    syncCron: process.env.ZOHO_SYNC_CRON || '*/15 * * * *',
    // Encrypts the stored Zoho refresh token; falls back to a key derived from JWT_SECRET.
    tokenKey: process.env.ZOHO_TOKEN_KEY || '',
  },

  // Google Gemini reads shipping-label photos into a draft shipment (Scan label).
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  },

  // Push-ingestion endpoint: lets an upstream system (order system, booking API, etc.)
  // register a new shipment without a user login - see routes/ingest.routes.js.
  ingest: {
    apiKey: process.env.INGEST_API_KEY || '',
    ownerEmail: process.env.INGEST_OWNER_EMAIL || '',
  },
};

module.exports = env;
