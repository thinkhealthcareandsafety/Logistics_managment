const axios = require('axios');
const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { getCatalog, findCourier } = require('./courierCatalog.service');

/**
 * Reads a photo of a shipping label, courier booking slip or consignment note with
 * Google Gemini and returns a draft shipment. Nothing is saved here - the person checks
 * the draft in the Add shipment form and confirms, because a misread digit in an AWB
 * would track somebody else's parcel.
 */

// What Gemini accepts. The browser converts photos to JPEG first anyway.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const PDF_TYPE = 'application/pdf';

/**
 * Tried in order. Flash models are quick and cheap and read labels well; Google
 * sometimes answers "high demand" (503) for one model while another is fine.
 */
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-flash-latest'];
const models = () => [...new Set([env.gemini.model, ...FALLBACK_MODELS].filter(Boolean))];

// Gemini's response schema is an OpenAPI subset: upper-case types, `nullable`.
const S = { type: 'STRING', nullable: true };
const N = { type: 'NUMBER', nullable: true };
const object = (properties) => ({ type: 'OBJECT', properties, required: Object.keys(properties) });

const SCHEMA = object({
  isShippingDocument: { type: 'BOOLEAN' },
  trackingNumber: S,
  courierCode: S,
  courierName: S,
  customer: object({ name: S, phone: S, email: S }),
  address: object({ line: S, city: S, state: S, pincode: S }),
  product: object({ name: S, quantity: N }),
  weightKg: N,
  freightAmount: N,
  shippingDate: S,
  estimatedDelivery: S,
  uncertainFields: {
    type: 'ARRAY',
    items: {
      type: 'STRING',
      enum: ['trackingNumber', 'courier', 'customerName', 'customerPhone', 'customerEmail', 'address', 'pincode', 'productName', 'quantity', 'weightKg', 'freightAmount', 'shippingDate', 'estimatedDelivery'],
    },
  },
  notes: S,
});

const isConfigured = () => Boolean(env.gemini.apiKey);

/** Indian couriers first - that is who this business ships with - then the rest by name. */
async function courierChoices() {
  const list = await getCatalog();
  return list.filter((c) => c.country === 'IN').map((c) => `${c.code}: ${c.name}`);
}

function systemPrompt(couriers) {
  return `You read photos and scans of shipping documents for an Indian B2B healthcare supplier (ThinkHealth) and turn them into a shipment record. Typical documents: courier shipping labels, booking slips, consignment notes, airway bills and parcel stickers, often photographed on a phone at an angle, handwritten in places, or partly torn.

The sender is usually ThinkHealth itself. The customer is the consignee / receiver / "To" party - never the shipper / sender / "From" party. Take the address, phone and name from the consignee block.

Field rules:
- trackingNumber: the courier's AWB / consignment / docket / tracking number, exactly as printed, without spaces. It is usually the number under or beside the barcode. Do not use an invoice number, order number, reference number or pincode. If several candidates exist, pick the one labelled AWB / CN / Docket / Tracking.
- courierCode: pick the matching code from the courier list below, judging by the logo, company name or website on the document. Use null if the courier is not in the list or you cannot tell. courierName: the courier's name as printed, or null.
- customer.phone: digits only, keep a leading country code if printed (e.g. 919876543210 or 9876543210).
- address.line: street, building and area of the consignee, without city, state and pincode. address.pincode: the 6-digit Indian PIN code.
- product: the item or contents description and the number of pieces/boxes if stated.
- weightKg: the actual or charged weight converted to kilograms (e.g. "500 g" -> 0.5). freightAmount: the freight / courier charge in rupees, as a number, if printed.
- shippingDate / estimatedDelivery: ISO dates (YYYY-MM-DD). Indian documents write dates day-first: 03/10/26 is 3 October 2026.
- Use null for anything not on the document. Never guess or invent a value.
- uncertainFields: list every field you filled but could not read with confidence (blurred, handwritten, cut off, ambiguous digit).
- isShippingDocument: false if the image is not a shipping document at all; then leave the other fields null.
- notes: one short sentence for the person checking the result, only if something needs their attention (e.g. "AWB partly covered by tape - check the last two digits"). Otherwise null.

Courier list (code: name):
${couriers.join('\n')}`;
}

/** Google's errors that mean "try another model", not "this request is wrong". */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

async function callGemini(model, body) {
  const base = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const { data } = await axios.post(`${base}/v1beta/models/${model}:generateContent`, body, {
    headers: { 'x-goog-api-key': env.gemini.apiKey },
    // Kept well under the browser's 2-minute wait so a fallback model still has time.
    timeout: 45_000,
  });
  return data;
}

/** Runs the request on each model in turn until one answers; maps Google's errors to ours. */
async function generate(body) {
  let lastErr;
  for (const model of models()) {
    try {
      return await callGemini(model, body);
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const message = err.response?.data?.error?.message || err.message;
      // A model this key can't use (404) or one that's overloaded - move on to the next.
      if (status === 404 || RETRYABLE.has(status) || !status) {
        logger.warn(`Gemini ${model} unavailable (${status || err.code}): ${message}`);
        continue;
      }
      if (status === 400 && /api key/i.test(message)) {
        throw new ApiError(503, 'The GEMINI_API_KEY on the server was rejected - check the key and restart the server.');
      }
      if (status === 401 || status === 403) {
        throw new ApiError(503, 'The GEMINI_API_KEY on the server isn’t allowed to use Gemini - check the key in Google AI Studio.');
      }
      if (status === 400) {
        logger.warn(`Label extraction rejected by Gemini: ${message}`);
        throw new ApiError(400, 'That image couldn’t be read. Try a sharper photo, or a JPG/PNG/PDF under 8 MB.');
      }
      throw new ApiError(502, `The label reader failed (${message})`);
    }
  }
  if (lastErr?.response?.status === 429) {
    throw new ApiError(429, 'Too many label scans at once - wait a few seconds and try again.');
  }
  logger.error(`Label extraction failed on every model: ${lastErr?.message}`);
  throw new ApiError(502, 'The label reader is busy right now - try again in a minute, or fill the form by hand.');
}

const clean = (v) => {
  if (v === null || v === undefined) return '';
  return String(v).trim();
};
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(v)) ? clean(v) : '');
const positive = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** The model's free-text courier name -> a catalog courier, when its code was missing or wrong. */
async function matchCourierByName(name) {
  const strip = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/\b(courier|couriers|services?|express|logistics|pvt|private|ltd|limited|india|co)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  const wanted = strip(name);
  if (wanted.length < 3) return null;
  const list = await getCatalog();
  const indian = list.filter((c) => c.country === 'IN');
  return (
    indian.find((c) => strip(c.name) === wanted) ||
    indian.find((c) => strip(c.name).includes(wanted) || wanted.includes(strip(c.name))) ||
    null
  );
}

async function extractShipmentFromDocument(file) {
  if (!file) throw new ApiError(400, 'Attach a photo of the label');
  if (![...IMAGE_TYPES, PDF_TYPE].includes(file.mimetype)) {
    throw new ApiError(400, 'Use a JPG, PNG, WebP or PDF - that file type can’t be read');
  }
  if (!isConfigured()) {
    throw new ApiError(
      503,
      'Reading labels from photos is not set up yet. Add GEMINI_API_KEY to the server .env file and restart the server.'
    );
  }

  const response = await generate({
    systemInstruction: { parts: [{ text: systemPrompt(await courierChoices()) }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: file.mimetype, data: file.buffer.toString('base64') } },
          { text: 'Extract the shipment details from this document.' },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
  });

  const candidate = response.candidates?.[0];
  if (response.promptFeedback?.blockReason || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(candidate?.finishReason)) {
    throw new ApiError(422, 'This image couldn’t be processed. Fill the details in by hand.');
  }
  const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text || candidate.finishReason === 'MAX_TOKENS') {
    throw new ApiError(502, 'The label reader returned an incomplete answer - try again.');
  }

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiError(502, 'The label reader returned an unreadable answer - try again.');
  }
  if (!raw.isShippingDocument) {
    throw new ApiError(422, 'That doesn’t look like a shipping label or booking slip. Try a photo of the label itself.');
  }

  // Trust the code only if it is really in the catalog; otherwise match the printed name.
  let courier = raw.courierCode ? await findCourier(raw.courierCode) : null;
  if (!courier && raw.courierName) courier = await matchCourierByName(raw.courierName);

  const uncertain = new Set(raw.uncertainFields || []);
  if (!courier && clean(raw.courierName)) uncertain.add('courier');

  return {
    trackingNumber: clean(raw.trackingNumber).replace(/\s+/g, ''),
    carrierCode: courier ? courier.code : '',
    carrierName: courier ? courier.name : '',
    printedCourierName: clean(raw.courierName),
    customerInfo: {
      name: clean(raw.customer?.name),
      phone: clean(raw.customer?.phone).replace(/[^\d+]/g, ''),
      email: clean(raw.customer?.email).toLowerCase(),
    },
    deliveryAddress: {
      line: clean(raw.address?.line),
      city: clean(raw.address?.city),
      state: clean(raw.address?.state),
      pincode: (clean(raw.address?.pincode).match(/\d{6}/) || [''])[0],
    },
    productDetails: {
      name: clean(raw.product?.name),
      quantity: positive(raw.product?.quantity) ? Math.round(raw.product.quantity) : null,
    },
    weightKg: positive(raw.weightKg),
    freightAmount: positive(raw.freightAmount),
    shippingDate: isoDate(raw.shippingDate),
    estimatedDelivery: isoDate(raw.estimatedDelivery),
    uncertainFields: [...uncertain],
    notes: clean(raw.notes),
  };
}

module.exports = { extractShipmentFromDocument, isConfigured, IMAGE_TYPES, PDF_TYPE };
