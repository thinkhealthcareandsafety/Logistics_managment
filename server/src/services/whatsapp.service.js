const axios = require('axios');
const env = require('../config/env');
const logger = require('../config/logger');
const budget = require('./whatsappBudget');

/** The on/off switch on the stock settings - while paused, nothing is sent. */
async function isPaused() {
  const StockSettings = require('../models/StockSettings');
  const s = await StockSettings.findOne({ key: 'default' }).select('whatsappPaused');
  return s ? s.whatsappPaused !== false : true;
}

/**
 * WhatsApp sending. Anantya.ai when ANANTYA_API_KEY is set, otherwise Gupshup; with
 * neither, every send is a logged no-op so missing credentials never break a flow.
 *
 * WhatsApp only lets a business start a conversation with a Meta-approved template.
 * So each message kind has a template (shipment_status, delivery_feedback,
 * stock_update) filled with short values; if that template isn't approved in Anantya
 * yet, the full text is sent as a normal message instead, which WhatsApp delivers only
 * when the person has messaged the business number in the last 24 hours.
 */

const GUPSHUP_SEND_URL = 'https://api.gupshup.io/wa/api/v1/msg';

const STATUS_LABELS = {
  pending: 'Pending',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
};

/** Digits only, with India's 91 in front of a bare 10-digit mobile number. */
function toE164ish(number) {
  const digits = (number || '').replace(/[^\d]/g, '').replace(/^0+/, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

/** Template values can't hold line breaks or long runs of spaces (Meta rejects them). */
const attr = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 900) || '-';

function buildStatusText({ shipment, checkpoint, trackingUrl }) {
  const statusLabel = STATUS_LABELS[checkpoint.status] || checkpoint.status;
  const lines = [
    `*ThinkHealth Logistics*`,
    `Shipment ${shipment.trackingNumber} is now *${statusLabel}*.`,
  ];
  if (checkpoint.location) lines.push(`Location: ${checkpoint.location}`);
  if (checkpoint.description) lines.push(checkpoint.description);
  if (trackingUrl) lines.push('', `Track it live: ${trackingUrl}`);
  return lines.join('\n');
}

function buildDeliveryText({ shipment, trackingUrl, feedbackUrl }) {
  const name = shipment.customerInfo?.name;
  return [
    `*ThinkHealth Logistics*`,
    name ? `Hi ${name},` : 'Hello,',
    '',
    `*Thank you for choosing ThinkHealth.* Your order ${shipment.trackingNumber} has been delivered.`,
    '',
    'Please tell us how we did — it takes under a minute:',
    feedbackUrl,
    '',
    `Delivery details: ${trackingUrl}`,
  ].join('\n');
}

// ─────────────────────────── Anantya.ai ───────────────────────────

const anantyaApi = () =>
  axios.create({ baseURL: env.anantya.baseUrl, headers: { 'X-Api-Key': env.anantya.apiKey, accept: '*/*' }, timeout: 15000 });

const isAccepted = (t) => t.isActive !== false && /accept|approv/i.test(t.templateStatus || '');

let templateCache = { at: 0, list: null };

/** The account's templates, cached for 10 minutes. */
async function anantyaTemplates({ fresh = false } = {}) {
  if (!fresh && templateCache.list && Date.now() - templateCache.at < 10 * 60 * 1000) return templateCache.list;
  const { data } = await anantyaApi().get('/api/Campaign/GetTemplates');
  const list = Array.isArray(data?.dataObj) ? data.dataObj : [];
  templateCache = { at: Date.now(), list };
  return list;
}

/**
 * Templates each message kind can use, best first, with which value fills {{1}}, {{2}}...
 * The first one approved in the Anantya account wins. new_order_3 / neworderupdate0001
 * are ThinkHealth's existing approved templates; the first entries are the ideal ones
 * (with the feedback / live stock link) to create in Anantya.
 */
const KNOWN_TEMPLATES = {
  status: [
    { name: 'shipment_status', fields: ['awb', 'status', 'link'] },
    { name: 'new_order_3', fields: ['status', 'awb', 'link'] },
    { name: 'new_order2', fields: ['status', 'awb', 'link'] },
  ],
  delivery: [
    { name: 'delivery_feedback', fields: ['name', 'awb', 'feedbackUrl'] },
    { name: 'neworderupdate0001', fields: ['name', 'awb'] },
    { name: 'orderupdate1', fields: ['name', 'awb'] },
  ],
  stock: [{ name: 'stock_update', fields: ['date', 'summary', 'link'] }],
  booked: [
    { name: 'shipment_utility', fields: ['name', 'date', 'shipmentId', 'awb', 'courier', 'link'] },
    { name: 'shipment_utility1', fields: ['name', 'date', 'shipmentId', 'awb', 'courier', 'link'] },
  ],
  customerStatus: [
    { name: 'new_order_3', fields: ['status', 'awb', 'link'] },
    { name: 'new_order2', fields: ['status', 'awb', 'link'] },
  ],
};

/** The kind's choices: the *_TEMPLATE override alone when set, else the known list. */
function templateChoices(kind) {
  const override = String(env.anantya.templates[kind] || '').trim();
  if (!override) return KNOWN_TEMPLATES[kind] || [];
  const [name, fieldList] = override.split('|');
  const known = (KNOWN_TEMPLATES[kind] || []).find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
  const fields = fieldList ? fieldList.split(',').map((x) => x.trim()).filter(Boolean) : known?.fields || KNOWN_TEMPLATES[kind]?.[0]?.fields || [];
  return [{ name: name.trim(), fields }];
}

const sameTemplate = (t, name) => String(t.id) === String(name) || String(t.templateName || '').toLowerCase() === String(name).toLowerCase();

/** The approved template for a message kind ('status' | 'delivery' | 'stock') and its field order, or null. */
async function anantyaTemplate(kind) {
  const list = await anantyaTemplates();
  for (const choice of templateChoices(kind)) {
    const t = list.find((x) => sameTemplate(x, choice.name) && isAccepted(x));
    if (t) return { ...t, fields: choice.fields };
  }
  return null;
}

async function anantyaSend({ to, text, template, context }) {
  let tpl = null;
  if (template) {
    try {
      tpl = await anantyaTemplate(template.kind);
    } catch (err) {
      logger.warn(`${context}: couldn't read Anantya templates (${err.response?.status || err.message}) - sending as text`);
    }
  }
  try {
    let data;
    if (tpl) {
      const form = new FormData();
      form.append('ContactNo', to);
      form.append('ContactName', attr(template.contactName || to));
      form.append('MediaFile', '');
      form.append('MediaFileName', '');
      for (let i = 0; i < 8; i++) form.append(`Attribute${i + 1}`, i < tpl.fields.length ? attr(template.values[tpl.fields[i]]) : '');
      ({ data } = await anantyaApi().post('/api/Campaign/SendSingleTemplateMessage', form, { params: { templateId: tpl.id } }));
    } else {
      ({ data } = await anantyaApi().post('/api/Messages/sendtext', { msgText: text, contactNo: to }));
    }
    if (data?.isSuccess === false) throw new Error(data.message || 'Anantya refused the message');
    return true;
  } catch (err) {
    const why = err.response?.data?.message || err.response?.data?.title || err.message;
    logger.error(`${context}: Anantya WhatsApp to ${to} failed (${tpl ? `template ${tpl.templateName}` : 'text'}): ${why}`);
    return false;
  }
}

// ─────────────────────────── Gupshup ───────────────────────────

async function gupshupSend({ to, text, context }) {
  const body = new URLSearchParams({
    channel: 'whatsapp',
    source: env.gupshup.sourceNumber,
    destination: to,
    'src.name': env.gupshup.appName,
    message: JSON.stringify({ type: 'text', text }),
  });
  try {
    await axios.post(GUPSHUP_SEND_URL, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', apikey: env.gupshup.apiKey },
      timeout: 10000,
    });
    return true;
  } catch (err) {
    logger.error(`${context}: Gupshup WhatsApp to ${to} failed: ${err.response?.data?.message || err.message}`);
    return false;
  }
}

// ─────────────────────────── Sending ───────────────────────────

const provider = () => (env.anantya.apiKey ? 'anantya' : env.gupshup.apiKey && env.gupshup.sourceNumber ? 'gupshup' : null);

/** Sends one message. `template` ({ kind, values, contactName }) is used by Anantya. */
async function sendWhatsApp({ to, text, template, context }) {
  const via = provider();
  if (!via) {
    logger.debug('WhatsApp not configured - skipping');
    return false;
  }
  const destination = toE164ish(to);
  if (!destination) {
    logger.warn(`${context}: no destination number, skipping`);
    return false;
  }
  if (await isPaused()) {
    logger.info(`${context}: WhatsApp is paused - not sent to ${destination}`);
    return false;
  }
  // Each delivered message is billed - none goes out past the limits.
  if (!(await budget.reserve(destination, context))) return false;
  const ok = await (via === 'anantya' ? anantyaSend({ to: destination, text, template, context }) : gupshupSend({ to: destination, text, context }));
  if (!ok) await budget.release(destination);
  return ok;
}

/** Status update: AWB, status and live tracking link. */
function sendWhatsAppStatusMessage({ to, shipment, checkpoint, trackingUrl }) {
  return sendWhatsApp({
    to,
    text: buildStatusText({ shipment, checkpoint, trackingUrl }),
    template: { kind: 'status', values: { awb: shipment.trackingNumber, status: STATUS_LABELS[checkpoint.status] || checkpoint.status, link: trackingUrl } },
    context: 'sendWhatsAppStatusMessage',
  });
}

/** Delivery thank-you: customer name, AWB and feedback link. */
function sendWhatsAppDeliveryMessage({ to, shipment, trackingUrl, feedbackUrl }) {
  const name = shipment.customerInfo?.name || 'there';
  return sendWhatsApp({
    to,
    text: buildDeliveryText({ shipment, trackingUrl, feedbackUrl }),
    template: { kind: 'delivery', values: { name, awb: shipment.trackingNumber, feedbackUrl, link: trackingUrl }, contactName: shipment.customerInfo?.name },
    context: 'sendWhatsAppDeliveryMessage',
  });
}

const shortDate = (d) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(d ? new Date(d) : new Date());

/** To the customer when a shipment is booked: date, shipment ID, AWB, courier, live link. */
function sendWhatsAppBookedMessage({ to, shipment, trackingUrl }) {
  const name = shipment.customerInfo?.name || 'there';
  const values = {
    name,
    date: shortDate(shipment.shippingDate || shipment.createdAt),
    shipmentId: shipment.zohoInvoice?.number || shipment.productDetails?.name || shipment.trackingNumber,
    awb: shipment.trackingNumber,
    courier: shipment.carrierName || '-',
    link: trackingUrl,
  };
  return sendWhatsApp({
    to,
    text: [
      '*ThinkHealth Logistics*',
      `Hello ${name}, your shipment has been created.`,
      '',
      `• Shipment date: ${values.date}`,
      `• Tracking number: ${values.awb}`,
      `• Courier partner: ${values.courier}`,
      `• Tracking link: ${trackingUrl}`,
    ].join('\n'),
    template: { kind: 'booked', values, contactName: shipment.customerInfo?.name },
    context: 'sendWhatsAppBookedMessage',
  });
}

/** To the customer on a status worth telling them about (out for delivery). */
function sendWhatsAppCustomerStatus({ to, shipment, status, trackingUrl }) {
  const label = STATUS_LABELS[status] || status;
  return sendWhatsApp({
    to,
    text: ['*ThinkHealth Logistics*', `Your shipment is ${label.toLowerCase()}.`, `Tracking ID: ${shipment.trackingNumber}`, `Tracking link: ${trackingUrl}`].join('\n'),
    template: { kind: 'customerStatus', values: { status: label, awb: shipment.trackingNumber, link: trackingUrl }, contactName: shipment.customerInfo?.name },
    context: 'sendWhatsAppCustomerStatus',
  });
}

/** Free-form text, e.g. the stock update. `template` is optional. */
function sendWhatsAppText({ to, text, template, context = 'sendWhatsAppText' }) {
  return sendWhatsApp({ to, text, template, context });
}

/** True when Anantya has an approved template for this kind, so one template message replaces long text. */
async function templateReady(kind) {
  if (provider() !== 'anantya') return false;
  return Boolean(await anantyaTemplate(kind).catch(() => null));
}

function isWhatsAppConfigured() {
  return Boolean(provider());
}

/** Which provider is live and, for Anantya, whether the key works and which templates are approved. */
async function whatsAppStatus() {
  const via = provider();
  if (via !== 'anantya') return { provider: via, configured: Boolean(via) };
  const out = {
    provider: 'anantya',
    configured: true,
    senderNumber: env.anantya.senderNumber ? `…${env.anantya.senderNumber.slice(-4)}` : '',
    usage: await budget.usage().catch(() => null),
    paused: await isPaused().catch(() => true),
  };
  try {
    const list = await anantyaTemplates({ fresh: true });
    out.keyWorks = true;
    out.templates = Object.fromEntries(
      Object.keys(KNOWN_TEMPLATES).map((kind) => {
        const choices = templateChoices(kind);
        const use = choices.map((c) => ({ c, t: list.find((x) => sameTemplate(x, c.name) && isAccepted(x)) })).find((x) => x.t);
        return [kind, use ? { using: use.t.templateName, id: use.t.id, fields: use.c.fields } : { using: null, wanted: choices.map((c) => c.name), fallback: 'plain text (delivered only within 24h of the person messaging you)' }];
      })
    );
    out.allTemplates = list.map((t) => ({ id: t.id, name: t.templateName, status: t.templateStatus, active: t.isActive, text: t.msgText || '' }));
  } catch (err) {
    out.keyWorks = false;
    out.error = err.response?.status === 401 || err.response?.status === 403 ? 'Anantya rejected the API key' : err.response?.data?.message || err.message;
  }
  return out;
}

module.exports = {
  sendWhatsAppBookedMessage,
  sendWhatsAppCustomerStatus,
  sendWhatsAppStatusMessage,
  sendWhatsAppDeliveryMessage, sendWhatsAppText, isWhatsAppConfigured, whatsAppStatus, templateReady };
