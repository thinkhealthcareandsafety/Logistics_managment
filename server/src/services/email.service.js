const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../config/logger');

let transporter = null;

function getTransporter() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

const STATUS_LABELS = {
  pending: 'Pending',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
};

/** Minimal HTML escaping - every value below is user- or carrier-supplied. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function shell(inner) {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: auto;">
      <div style="background:#0f4c5c; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="color:#fff; margin:0; font-size:18px;">ThinkHealth Logistics</h2>
      </div>
      <div style="border:1px solid #e5e7eb; border-top:none; padding: 24px; border-radius: 0 0 8px 8px;">
        ${inner}
      </div>
    </div>`;
}

function button(href, label, background) {
  return `<a href="${esc(href)}" style="display:inline-block; background:${background}; color:#fff; text-decoration:none; font-weight:600; font-size:14px; padding:11px 20px; border-radius:8px;">${esc(label)}</a>`;
}

function buildStatusEmail({ shipment, checkpoint, trackingUrl }) {
  const statusLabel = STATUS_LABELS[checkpoint.status] || checkpoint.status;
  const subject = `Shipment ${shipment.trackingNumber} is now ${statusLabel}`;
  const html = shell(`
        <p style="font-size:16px; color:#111827;">
          Shipment <strong>${esc(shipment.trackingNumber)}</strong> (${esc(shipment.carrierName || shipment.carrierCode)})
          is now <strong>${esc(statusLabel)}</strong>.
        </p>
        <table style="width:100%; font-size:14px; color:#374151; margin-top:12px;">
          <tr><td style="padding:4px 0; color:#6b7280;">Location</td><td>${esc(checkpoint.location || '—')}</td></tr>
          <tr><td style="padding:4px 0; color:#6b7280;">Details</td><td>${esc(checkpoint.description || '—')}</td></tr>
          <tr><td style="padding:4px 0; color:#6b7280;">Time</td><td>${esc(new Date(checkpoint.checkpointTime).toLocaleString())}</td></tr>
          ${shipment.customerInfo?.name ? `<tr><td style="padding:4px 0; color:#6b7280;">Customer</td><td>${esc(shipment.customerInfo.name)}</td></tr>` : ''}
        </table>
        ${trackingUrl ? `<p style="margin-top:20px;">${button(trackingUrl, 'View live tracking', '#0f4c5c')}</p>` : ''}`);
  return { subject, html };
}

/**
 * The customer-facing delivery message: thanks, a feedback link, and the tracking
 * link so they can still see the full journey after the fact.
 */
function buildDeliveryFeedbackEmail({ shipment, trackingUrl, feedbackUrl }) {
  const name = shipment.customerInfo?.name;
  const product = shipment.productDetails?.name;
  const subject = `Delivered: ${shipment.trackingNumber} — how did we do?`;
  const html = shell(`
        <p style="font-size:17px; color:#111827; margin:0 0 4px;">
          ${name ? `Hi ${esc(name)},` : 'Hello,'}
        </p>
        <p style="font-size:16px; color:#111827; margin:0 0 16px;">
          <strong>Thank you for choosing ThinkHealth.</strong> Your order has been delivered.
        </p>
        <table style="width:100%; font-size:14px; color:#374151; border-top:1px solid #e5e7eb; padding-top:12px;">
          <tr><td style="padding:6px 0; color:#6b7280;">Tracking number</td><td style="font-family:monospace;">${esc(shipment.trackingNumber)}</td></tr>
          ${product ? `<tr><td style="padding:6px 0; color:#6b7280;">Item</td><td>${esc(product)}</td></tr>` : ''}
        </table>
        <p style="font-size:15px; color:#111827; margin:20px 0 12px;">
          Please take a moment to tell us how it went — it takes under a minute.
        </p>
        <p style="margin:0 0 20px;">${button(feedbackUrl, 'Leave your feedback', '#0f4c5c')}</p>
        <p style="font-size:13px; color:#6b7280; margin:0; border-top:1px solid #e5e7eb; padding-top:16px;">
          Need the delivery details again? <a href="${esc(trackingUrl)}" style="color:#1a525d;">View your tracking page</a>.
        </p>`);
  return { subject, html };
}

async function send({ to, subject, html }) {
  const client = getTransporter();
  if (!client) {
    logger.debug('SMTP not configured - skipping email notification');
    return false;
  }
  try {
    await client.sendMail({ from: env.smtp.from, to, subject, html });
    return true;
  } catch (err) {
    logger.error(`Failed to send email to ${to}: ${err.message}`);
    return false;
  }
}

function sendStatusChangeEmail({ to, shipment, checkpoint, trackingUrl }) {
  return send({ to, ...buildStatusEmail({ shipment, checkpoint, trackingUrl }) });
}

function sendDeliveryFeedbackEmail({ to, shipment, trackingUrl, feedbackUrl }) {
  return send({ to, ...buildDeliveryFeedbackEmail({ shipment, trackingUrl, feedbackUrl }) });
}

function isEmailConfigured() {
  return Boolean(env.smtp.host);
}

module.exports = { sendStatusChangeEmail, sendDeliveryFeedbackEmail, isEmailConfigured };
