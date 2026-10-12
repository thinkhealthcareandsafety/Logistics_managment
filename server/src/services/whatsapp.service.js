const axios = require('axios');
const env = require('../config/env');
const logger = require('../config/logger');

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

/** The approved template for a message kind ('status' | 'delivery' | 'stock'), or null. */
async function anantyaTemplate(kind) {
  const wanted = String(env.anantya.templates[kind] || '').trim().toLowerCase();
  if (!wanted) return null;
  const list = await anantyaTemplates();
  const t = list.find((x) => String(x.id) === wanted || String(x.templateName || '').toLowerCase() === wanted);
  return t && isAccepted(t) ? t : null;
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
      for (let i = 0; i < 8; i++) form.append(`Attribute${i + 1}`, template.attributes[i] != null ? attr(template.attributes[i]) : '');
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

/** Sends one message. `template` ({ kind, attributes, contactName }) is used by Anantya. */
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
  return via === 'anantya' ? anantyaSend({ to: destination, text, template, context }) : gupshupSend({ to: destination, text, context });
}

/** Template shipment_status: {{1}} AWB, {{2}} status, {{3}} live tracking link. */
function sendWhatsAppStatusMessage({ to, shipment, checkpoint, trackingUrl }) {
  return sendWhatsApp({
    to,
    text: buildStatusText({ shipment, checkpoint, trackingUrl }),
    template: { kind: 'status', attributes: [shipment.trackingNumber, STATUS_LABELS[checkpoint.status] || checkpoint.status, trackingUrl] },
    context: 'sendWhatsAppStatusMessage',
  });
}

/** Template delivery_feedback: {{1}} customer name, {{2}} AWB, {{3}} feedback link. */
function sendWhatsAppDeliveryMessage({ to, shipment, trackingUrl, feedbackUrl }) {
  const name = shipment.customerInfo?.name || 'there';
  return sendWhatsApp({
    to,
    text: buildDeliveryText({ shipment, trackingUrl, feedbackUrl }),
    template: { kind: 'delivery', attributes: [name, shipment.trackingNumber, feedbackUrl], contactName: shipment.customerInfo?.name },
    context: 'sendWhatsAppDeliveryMessage',
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
  const out = { provider: 'anantya', configured: true, senderNumber: env.anantya.senderNumber ? `…${env.anantya.senderNumber.slice(-4)}` : '' };
  try {
    const list = await anantyaTemplates({ fresh: true });
    out.keyWorks = true;
    out.templates = Object.fromEntries(
      Object.entries(env.anantya.templates).map(([kind, name]) => {
        const t = list.find((x) => String(x.id) === String(name) || String(x.templateName || '').toLowerCase() === String(name).toLowerCase());
        return [kind, { name, found: Boolean(t), status: t?.templateStatus || null, approved: Boolean(t && isAccepted(t)), id: t?.id ?? null }];
      })
    );
    out.allTemplates = list.map((t) => ({ id: t.id, name: t.templateName, status: t.templateStatus, active: t.isActive, text: t.msgText || '' }));
  } catch (err) {
    out.keyWorks = false;
    out.error = err.response?.status === 401 || err.response?.status === 403 ? 'Anantya rejected the API key' : err.response?.data?.message || err.message;
  }
  return out;
}

module.exports = { sendWhatsAppStatusMessage, sendWhatsAppDeliveryMessage, sendWhatsAppText, isWhatsAppConfigured, whatsAppStatus, templateReady };
