const axios = require('axios');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { seal, open } = require('../utils/secretBox');

/**
 * Thin Zoho Books client: OAuth (server-based app, offline access) and the two read
 * endpoints the stock sync needs. Read-only scope - this app never writes to the books.
 */

const SCOPES = ['ZohoBooks.settings.READ'];

/** Zoho runs separate data centres; accounts and API hosts differ per region. */
const DC_DOMAINS = {
  in: 'zoho.in',
  com: 'zoho.com',
  us: 'zoho.com',
  eu: 'zoho.eu',
  au: 'zoho.com.au',
  jp: 'zoho.jp',
  uk: 'zoho.uk',
  sa: 'zoho.sa',
  ca: 'zohocloud.ca',
};

function accountsUrl() {
  if (env.zoho.accountsUrl) return env.zoho.accountsUrl.replace(/\/$/, '');
  return `https://accounts.${DC_DOMAINS[env.zoho.dc] || DC_DOMAINS.in}`;
}

function defaultApiDomain() {
  const domain = DC_DOMAINS[env.zoho.dc] || DC_DOMAINS.in;
  return `https://www.${domain.replace(/^zoho/, 'zohoapis')}`;
}

const isConfigured = () => Boolean(env.zoho.clientId && env.zoho.clientSecret);
const redirectUri = () => env.zoho.redirectUri || `${env.serverUrl}/api/integrations/zoho/callback`;

function authorizeUrl(state) {
  const params = new URLSearchParams({
    scope: SCOPES.join(','),
    client_id: env.zoho.clientId,
    response_type: 'code',
    access_type: 'offline',
    // Always ask again so Zoho issues a refresh token even on a reconnect.
    prompt: 'consent',
    redirect_uri: redirectUri(),
    state,
  });
  return `${accountsUrl()}/oauth/v2/auth?${params}`;
}

/** Zoho answers token errors with HTTP 200 and { error } - normalise both shapes. */
async function tokenRequest(params) {
  let data;
  try {
    ({ data } = await axios.post(`${accountsUrl()}/oauth/v2/token`, null, {
      params: { client_id: env.zoho.clientId, client_secret: env.zoho.clientSecret, ...params },
      timeout: 15000,
    }));
  } catch (err) {
    data = err.response?.data || { error: err.message };
  }
  if (!data || data.error || !data.access_token) {
    const reason = data?.error || 'no access token returned';
    throw new ApiError(502, `Zoho sign-in failed (${reason})`, { zohoError: reason });
  }
  return data;
}

/** One-time code from the redirect -> tokens. Returns what the connection should store. */
async function exchangeCode(code) {
  const data = await tokenRequest({ code, redirect_uri: redirectUri(), grant_type: 'authorization_code' });
  if (!data.refresh_token) {
    throw new ApiError(502, 'Zoho didn’t return a refresh token - remove the app from Zoho’s connected apps and connect again');
  }
  return {
    refreshToken: seal(data.refresh_token),
    accessToken: seal(data.access_token),
    accessTokenExpiresAt: new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000),
    apiDomain: data.api_domain || defaultApiDomain(),
  };
}

/**
 * A valid access token for the stored connection, refreshing (and saving) it when it
 * is within a minute of expiry. Zoho caps how many access tokens a refresh token may
 * mint, so the token is reused for its full hour rather than fetched per request.
 */
async function accessToken(conn, { force = false } = {}) {
  const fresh = conn.accessToken && conn.accessTokenExpiresAt && conn.accessTokenExpiresAt - Date.now() > 60_000;
  if (fresh && !force) return open(conn.accessToken);

  let data;
  try {
    data = await tokenRequest({ refresh_token: open(conn.refreshToken), grant_type: 'refresh_token' });
  } catch (err) {
    if (err.details?.zohoError === 'invalid_code' || err.details?.zohoError === 'invalid_client') {
      throw new ApiError(401, 'Zoho Books access was revoked or expired - connect Zoho Books again', { reconnect: true });
    }
    throw err;
  }
  conn.accessToken = seal(data.access_token);
  conn.accessTokenExpiresAt = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000);
  if (data.api_domain) conn.apiDomain = data.api_domain;
  await conn.save();
  return data.access_token;
}

/** GET against Zoho Books v3, retrying once with a new token on 401. */
async function booksGet(conn, path, params = {}) {
  const run = async (token) =>
    axios.get(`${conn.apiDomain || defaultApiDomain()}/books/v3${path}`, {
      params,
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      timeout: 20000,
    });
  let res;
  try {
    res = await run(await accessToken(conn));
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.response?.status === 401) {
      res = await run(await accessToken(conn, { force: true })).catch((e) => e.response || Promise.reject(e));
    } else if (err.response) {
      res = err.response;
    } else {
      throw new ApiError(502, `Couldn’t reach Zoho Books (${err.message})`);
    }
  }
  const body = res.data || {};
  if (res.status >= 400 || (body.code !== undefined && body.code !== 0)) {
    const msg = body.message || `HTTP ${res.status}`;
    throw new ApiError(res.status === 429 ? 429 : 502, `Zoho Books: ${msg}`);
  }
  return body;
}

async function listOrganizations(conn) {
  const body = await booksGet(conn, '/organizations');
  return (body.organizations || []).map((o) => ({
    id: String(o.organization_id),
    name: o.name,
    isDefault: Boolean(o.is_default_org),
  }));
}

/** Every item in the organisation (200 a page - a few pages at most for this business). */
async function listItems(conn, extraParams = {}) {
  const items = [];
  for (let page = 1; page <= 50; page += 1) {
    const body = await booksGet(conn, '/items', { organization_id: conn.organizationId, page, per_page: 200, ...extraParams });
    items.push(...(body.items || []));
    if (!body.page_context?.has_more_page) break;
  }
  return items;
}

/** One item in full (includes stock and per-warehouse figures where the list may not). */
async function getItem(conn, itemId) {
  const body = await booksGet(conn, `/items/${encodeURIComponent(itemId)}`, { organization_id: conn.organizationId });
  return body.item || {};
}

/** Best effort: tell Zoho to drop the refresh token on disconnect. */
async function revoke(conn) {
  if (!conn.refreshToken) return;
  await axios
    .post(`${accountsUrl()}/oauth/v2/token/revoke`, null, { params: { token: open(conn.refreshToken) }, timeout: 10000 })
    .catch(() => {});
}

module.exports = {
  SCOPES,
  isConfigured,
  redirectUri,
  authorizeUrl,
  exchangeCode,
  listOrganizations,
  listItems,
  getItem,
  revoke,
};
