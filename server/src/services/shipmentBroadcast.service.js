const Shipment = require('../models/Shipment');
const ShipmentBroadcast = require('../models/ShipmentBroadcast');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const env = require('../config/env');
const { sendWhatsAppText, isWhatsAppConfigured } = require('./whatsapp.service');
const { splitForWhatsApp } = require('./stock.service');

/**
 * The daily shipment update on WhatsApp - the same message the team copies from the
 * dashboard, sent by itself at a set time. Built and ready, but OFF until someone turns
 * it on; and it only sends once a WhatsApp API key is set and WhatsApp is un-paused
 * (every send goes through the same pause switch and daily limits as all WhatsApp).
 */

const TZ = 'Asia/Kolkata';
const ORDER = ['exception', 'out_for_delivery', 'in_transit', 'pending', 'delivered'];
const istYmd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));
const istHm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));

function stamp(date) {
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(date);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  return `${day}  ${time}`;
}

/** "HUB ANDHERI, MUMBAI" -> "Andheri". */
function place(s) {
  const raw = s.currentLocation || s.deliveryAddress?.city || '';
  const first = raw.split(/[,·]/)[0].replace(/\b(hub|intransit|in transit|branch|centre|center|facility)\b/gi, '').trim();
  return first.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function statusText(s) {
  const where = place(s);
  switch (s.status) {
    case 'delivered':
      return 'Delivered ✅';
    case 'out_for_delivery':
      return `Out for delivery${where ? `-${where}` : ''} 🚚`;
    case 'in_transit':
      return `In transit${where ? `-${where}` : ''}`;
    case 'exception': {
      const latest = s.checkpoints?.[s.checkpoints.length - 1];
      return `Exception ⚠️ - ${latest?.description || 'needs follow-up'}`;
    }
    default:
      return 'Booked - awaiting pickup';
  }
}

/** The team's own format: "1.Heritage : Delivered ✅ / Tracking ID / Tracking Link". */
function buildShipmentsMessage(shipments, { scope = '', includeLinks = true, at = new Date() } = {}) {
  const ordered = [...shipments].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const lines = [`*SHIPMENT UPDATE  ${stamp(at)}*${scope ? `\n${scope}` : ''}`];
  ordered.forEach((s, i) => {
    const who = s.customerInfo?.name || s.productDetails?.name || s.carrierName || 'Shipment';
    lines.push('', `${i + 1}.${who} : ${statusText(s)}`);
    lines.push(` Tracking ID : ${s.trackingNumber}`);
    if (includeLinks) lines.push(` Tracking Link: ${env.clientUrl}/track/${encodeURIComponent(s.trackingNumber)}`);
  });
  if (shipments.length === 0) lines.push('', 'No shipments to report.');
  return lines.join('\n');
}

/** Today's message for a user: everything not delivered, plus what was delivered today. */
async function dailyMessage(userId, settings, at = new Date()) {
  const today = istYmd(at);
  const all = await Shipment.find({ createdBy: userId, isArchived: false })
    .select('trackingNumber carrierName status customerInfo.name productDetails.name currentLocation deliveryAddress.city deliveredAt checkpoints')
    .lean();
  const list = all.filter((s) => s.status !== 'delivered' || (s.deliveredAt && istYmd(s.deliveredAt) === today));
  return buildShipmentsMessage(list, { scope: 'Current shipments + delivered today', includeLinks: settings.includeLinks !== false, at });
}

async function settingsFor(userId) {
  return (await ShipmentBroadcast.findOne({ userId })) || ShipmentBroadcast.create({ userId });
}

/** Sends today's update to every saved number now (also what the schedule calls). */
async function sendShipmentUpdate(userId) {
  const settings = await settingsFor(userId);
  const to = settings.recipients.filter(Boolean);
  if (!to.length) throw new ApiError(400, 'Add at least one WhatsApp number first');
  if (!isWhatsAppConfigured()) throw new ApiError(503, 'WhatsApp sending isn’t connected yet - add the WhatsApp API key on the server first');
  const parts = splitForWhatsApp(await dailyMessage(userId, settings));
  let sent = 0;
  for (const number of to) {
    let ok = true;
    for (const part of parts) {
      // The pause switch and daily limits apply here, inside sendWhatsAppText.
      ok = await sendWhatsAppText({ to: number, text: part, context: 'shipmentBroadcast' });
      if (!ok) break;
    }
    if (ok) sent += 1;
  }
  if (sent) {
    settings.lastSentAt = new Date();
    await settings.save();
  }
  return { sent, failed: to.length - sent, total: to.length, messagesPerRecipient: parts.length };
}

/** Every minute: any user whose update is switched on and due now, and not yet sent today. */
async function runScheduledShipmentUpdates(now = new Date()) {
  const due = await ShipmentBroadcast.find({ enabled: true, time: istHm(now), 'recipients.0': { $exists: true } });
  for (const s of due) {
    if (s.lastSentAt && istYmd(s.lastSentAt) === istYmd(now)) continue;
    try {
      const r = await sendShipmentUpdate(s.userId);
      logger.info(`Scheduled shipment update: sent to ${r.sent}/${r.total}`);
    } catch (err) {
      logger.warn(`Scheduled shipment update not sent: ${err.message}`);
    }
  }
}

module.exports = { buildShipmentsMessage, dailyMessage, settingsFor, sendShipmentUpdate, runScheduledShipmentUpdates };
