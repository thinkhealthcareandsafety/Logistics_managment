import type { Shipment, ShipmentStatus } from '../types/shipment';
import { attentionReason } from './urgency';
import { deliverTo } from './logistics';

/** Problems first, then by how close to the door it is. */
const ORDER: ShipmentStatus[] = ['exception', 'out_for_delivery', 'in_transit', 'pending', 'delivered'];

function istStamp(date: Date) {
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit' }).format(date);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  return `${day}  ${time}`;
}

/** "HUB ANDHERI, MUMBAI" -> "Andheri" - the place a reader recognises, title-cased. */
function place(s: Shipment): string {
  const raw = s.currentLocation || deliverTo(s).place || '';
  const first = raw.split(/[,·]/)[0].replace(/\b(hub|intransit|in transit|branch|centre|center|facility)\b/gi, '').trim();
  return first.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** The status the way the team writes it: "Delivered ✅", "In transit-Andheri". */
function statusText(s: Shipment): string {
  const where = place(s);
  switch (s.status) {
    case 'delivered':
      return 'Delivered ✅';
    case 'out_for_delivery':
      return `Out for delivery${where ? `-${where}` : ''} 🚚`;
    case 'in_transit':
      return `In transit${where ? `-${where}` : ''}`;
    case 'exception':
      return `Exception ⚠️ - ${attentionReason(s)}`;
    default:
      return 'Booked - awaiting pickup';
  }
}

/**
 * The shipment update the team posts in WhatsApp, in their own format:
 *
 *   1.Heritage : Delivered ✅
 *    Tracking ID : 26043200312278
 *    Tracking Link: https://…/track/26043200312278
 *
 * The link is this app's live tracking page for that AWB, so it always shows the
 * latest scan, for any courier.
 */
export function buildShipmentsMessage(
  shipments: Shipment[],
  { scope, includeLinks, origin }: { scope?: string; includeLinks: boolean; origin: string }
): string {
  const ordered = [...shipments].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const lines = [`*SHIPMENT UPDATE  ${istStamp(new Date())}*${scope ? `\n${scope}` : ''}`];
  ordered.forEach((s, i) => {
    const who = s.customerInfo?.name || s.productDetails?.name || s.carrierName || 'Shipment';
    lines.push('', `${i + 1}.${who} : ${statusText(s)}`);
    lines.push(` Tracking ID : ${s.trackingNumber}`);
    if (includeLinks) lines.push(` Tracking Link: ${origin}/track/${encodeURIComponent(s.trackingNumber)}`);
  });
  if (shipments.length === 0) lines.push('', 'No shipments in this view.');
  return lines.join('\n');
}
