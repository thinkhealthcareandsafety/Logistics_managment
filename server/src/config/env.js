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
  // A stolen session is only good for a working day.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  // New accounts can only be created while this is "true" (e.g. briefly, for a new colleague).
  signupEnabled: process.env.SIGNUP_ENABLED === 'true',
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

  // Anantya.ai WhatsApp (preferred). Each message kind uses the first approved template
  // from a known list (see whatsapp.service.js); a *_TEMPLATE var picks one instead -
  // "name" or "name|field,field,..." (fields: awb, status, link, name, feedbackUrl, date, summary).
  anantya: {
    apiKey: process.env.ANANTYA_API_KEY || '',
    // Customer WhatsApp at each stage: booked, picked up, out for delivery (the delivery thank-you is separate). Off with "false".
    customerUpdates: process.env.WHATSAPP_CUSTOMER_UPDATES !== 'false',
    // Every delivered message is billed, so sends stop at these (see services/whatsappBudget.js).
    limits: {
      dailyLimit: Number(process.env.WHATSAPP_DAILY_LIMIT) || 40,
      monthlyLimit: Number(process.env.WHATSAPP_MONTHLY_LIMIT) || 500,
      perNumberDailyLimit: Number(process.env.WHATSAPP_PER_NUMBER_DAILY_LIMIT) || 3,
    },
    senderNumber: process.env.ANANTYA_SENDER_NUMBER || '',
    baseUrl: (process.env.ANANTYA_BASE_URL || 'https://apiv1.anantya.ai').replace(/\/$/, ''),
    templates: {
      status: process.env.ANANTYA_STATUS_TEMPLATE || '',
      delivery: process.env.ANANTYA_DELIVERY_TEMPLATE || '',
      stock: process.env.ANANTYA_STOCK_TEMPLATE || '',
      booked: process.env.ANANTYA_BOOKED_TEMPLATE || '',
      customerStatus: process.env.ANANTYA_CUSTOMER_STATUS_TEMPLATE || '',
    },
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
    apiKey: geminiKey().value,
    keyName: geminiKey().name,
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  },

  // Push-ingestion endpoint: lets an upstream system (order system, booking API, etc.)
  // register a new shipment without a user login - see routes/ingest.routes.js.
  ingest: {
    apiKey: process.env.INGEST_API_KEY || '',
    ownerEmail: process.env.INGEST_OWNER_EMAIL || '',
  },
};

// A guessable signing secret would let anyone mint a valid session - in production the
// server refuses to start without a long random one (Render generates it).
if (env.nodeEnv === 'production' && (env.jwtSecret === 'dev-only-insecure-secret' || env.jwtSecret.length < 32)) {
  throw new Error('JWT_SECRET must be a random value of at least 32 characters in production');
}

module.exports = env;

/**
 * The Gemini key, under its usual name or any variable that is clearly one
 * (GEMINI_PAID_API_KEY, GEMINI_KEY, GOOGLE_API_KEY...) - so a renamed key on the host
 * keeps label scans and photo search working. Values are trimmed of stray spaces.
 */
function geminiKey() {
  const names = ['GEMINI_API_KEY', ...Object.keys(process.env).filter((k) => /gemini/i.test(k) && /key/i.test(k)), 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY'];
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return { name, value };
  }
  return { name: '', value: '' };
}

