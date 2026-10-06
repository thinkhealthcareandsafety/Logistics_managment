const crypto = require('crypto');
const ZohoConnection = require('../models/ZohoConnection');
const { newWebhookToken } = require('../models/ZohoConnection');
const StockItem = require('../models/StockItem');
const User = require('../models/User');
const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { safeEqual } = require('../utils/secretBox');
const zoho = require('../services/zoho.client');
const { syncNow, scheduleWebhookSync, rememberWebhook, AUTO_CATEGORY } = require('../services/zohoSync.service');

const webhookUrl = (conn) => `${env.serverUrl}/api/integrations/zoho/webhook/${conn.webhookToken}`;

async function statusView(conn) {
  const linkedItems = conn.isConnected ? await StockItem.countDocuments({ isArchived: false, zohoItemId: { $ne: '' } }) : 0;
  return {
    configured: zoho.isConfigured(),
    connected: conn.isConnected,
    // Signed in to Zoho but no organisation picked yet.
    needsOrganization: Boolean(conn.refreshToken && !conn.organizationId),
    dataCenter: env.zoho.dc,
    redirectUri: zoho.redirectUri(),
    organizationId: conn.organizationId,
    organizationName: conn.organizationName,
    organizations: conn.organizations,
    connectedAt: conn.connectedAt,
    connectedBy: conn.connectedBy,
    autoCreate: conn.autoCreate,
    autoCategory: AUTO_CATEGORY,
    syncSchedule: env.zoho.syncCron,
    webhookUrl: conn.refreshToken ? webhookUrl(conn) : null,
    lastWebhookAt: conn.lastWebhookAt,
    lastSyncAt: conn.lastSyncAt,
    lastSyncOk: conn.lastSyncOk,
    lastSyncError: conn.lastSyncError,
    lastSyncSummary: conn.lastSyncSummary,
    lastSyncSample: conn.lastSyncSample || [],
    linkedItems,
  };
}

/** A free host sleeps when idle and misses scheduled syncs - catch up when someone looks. */
const STALE_MS = 5 * 60 * 1000;

const getStatus = asyncHandler(async (req, res) => {
  const conn = await ZohoConnection.get();
  if (conn.isConnected && (!conn.lastSyncAt || Date.now() - conn.lastSyncAt.getTime() > STALE_MS)) {
    syncNow({ reason: 'stale on view' }).catch(() => {});
  }
  res.json({ zoho: await statusView(conn) });
});

/** Starts the Zoho sign-in. The browser is sent to the returned URL. */
const startConnect = asyncHandler(async (req, res) => {
  if (!zoho.isConfigured()) {
    throw new ApiError(503, 'Zoho Books isn’t set up on the server yet - add ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET to the server .env and restart');
  }
  const conn = await ZohoConnection.get();
  conn.oauthState = crypto.randomBytes(24).toString('base64url');
  conn.oauthStateExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  conn.oauthUser = String(req.userId);
  await conn.save();
  res.json({ url: zoho.authorizeUrl(conn.oauthState) });
});

/**
 * Zoho redirects the browser here after sign-in. Public by necessity (it's a redirect,
 * not an API call), so the one-time `state` is what proves it's our own round-trip.
 */
const oauthCallback = async (req, res) => {
  const back = (outcome, message = '') =>
    res.redirect(`${env.clientUrl}/stock?zoho=${outcome}${message ? `&message=${encodeURIComponent(message)}` : ''}`);
  try {
    const conn = await ZohoConnection.get();
    const stateOk =
      conn.oauthState && conn.oauthStateExpiresAt > new Date() && safeEqual(req.query.state, conn.oauthState);
    if (!stateOk) return back('error', 'That Zoho sign-in link expired - press Connect again');
    if (req.query.error) return back('error', req.query.error === 'access_denied' ? 'Access wasn’t granted in Zoho' : String(req.query.error));
    if (!req.query.code) return back('error', 'Zoho didn’t send an authorisation code');

    const tokens = await zoho.exchangeCode(String(req.query.code));
    Object.assign(conn, tokens, { oauthState: '', oauthStateExpiresAt: null });
    const user = await User.findById(conn.oauthUser).select('name email');
    conn.connectedBy = user?.name || user?.email || '';
    conn.connectedAt = new Date();
    if (!conn.webhookToken) conn.webhookToken = newWebhookToken();

    const orgs = await zoho.listOrganizations(conn);
    conn.organizations = orgs.map(({ id, name }) => ({ id, name }));
    // Keep the previous organisation on a reconnect; else the only/default one.
    const keep = orgs.find((o) => o.id === conn.organizationId);
    const pick = keep || (orgs.length === 1 ? orgs[0] : orgs.find((o) => o.isDefault)) || null;
    conn.organizationId = pick ? pick.id : '';
    conn.organizationName = pick ? pick.name : '';
    await conn.save();

    if (conn.organizationId) {
      syncNow({ reason: 'connected' }).catch(() => {});
      return back('connected');
    }
    return back('pick-organization');
  } catch (err) {
    logger.warn(`Zoho connect failed: ${err.message}`);
    return back('error', err.message);
  }
};

const updateSettings = asyncHandler(async (req, res) => {
  const conn = await ZohoConnection.get();
  if (!conn.refreshToken) throw new ApiError(400, 'Connect Zoho Books first');
  let orgChanged = false;
  if (req.body.organizationId !== undefined) {
    const org = conn.organizations.find((o) => o.id === String(req.body.organizationId));
    if (!org) throw new ApiError(400, 'Pick one of your Zoho Books organisations');
    orgChanged = org.id !== conn.organizationId;
    if (orgChanged && conn.organizationId) {
      // Item ids belong to an organisation; links to the old one would point nowhere.
      await StockItem.updateMany({ zohoItemId: { $ne: '' } }, { $set: { zohoItemId: '', zohoItemName: '' } });
    }
    conn.organizationId = org.id;
    conn.organizationName = org.name;
  }
  if (req.body.autoCreate !== undefined) conn.autoCreate = Boolean(req.body.autoCreate);
  await conn.save();
  if (orgChanged) syncNow({ reason: 'organisation changed' }).catch(() => {});
  res.json({ zoho: await statusView(conn) });
});

const runSync = asyncHandler(async (req, res) => {
  const conn = await ZohoConnection.get();
  if (!conn.isConnected) throw new ApiError(400, 'Connect Zoho Books first');
  const summary = await syncNow({ reason: 'manual' });
  res.json({ summary, zoho: await statusView(await ZohoConnection.get()) });
});

const rotateWebhook = asyncHandler(async (req, res) => {
  const conn = await ZohoConnection.get();
  conn.webhookToken = newWebhookToken();
  await conn.save();
  res.json({ zoho: await statusView(conn) });
});

/**
 * Disconnect: forget the tokens. Links stay on the stock lines, so reconnecting the
 * same organisation picks up where it left off; until then every line is manual again.
 */
const disconnect = asyncHandler(async (req, res) => {
  const conn = await ZohoConnection.get();
  await zoho.revoke(conn);
  Object.assign(conn, {
    refreshToken: '',
    accessToken: '',
    accessTokenExpiresAt: null,
    connectedAt: null,
    connectedBy: '',
    lastSyncOk: null,
    lastSyncError: '',
  });
  await conn.save();
  res.json({ zoho: await statusView(conn) });
});

/**
 * Called by a Zoho Books workflow rule when a bill, invoice, credit note or stock
 * adjustment is saved. Answers at once and syncs a few seconds later.
 */
const webhook = asyncHandler(async (req, res) => {
  const conn = await ZohoConnection.findOne({ key: 'default' });
  if (!conn || !safeEqual(req.params.token, conn.webhookToken)) throw new ApiError(404, 'Not found');
  if (!conn.isConnected) return res.status(202).json({ ok: true, synced: false });
  const reference = rememberWebhook(req.body);
  conn.lastWebhookAt = new Date();
  await conn.save();
  scheduleWebhookSync();
  res.status(202).json({ ok: true, reference: reference || null });
});

module.exports = { getStatus, startConnect, oauthCallback, updateSettings, runSync, rotateWebhook, disconnect, webhook };
