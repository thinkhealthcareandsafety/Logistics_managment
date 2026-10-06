import { format } from 'date-fns';
import type { Shipment, ShipmentStatus } from '../types/shipment';
import { STATUS_LABELS } from './status';
import { attentionReason, daysLate, getUrgency, needsAttention } from './urgency';
import { deliverTo, deliveredOn, deliveryVerdict } from './logistics';

/** Problems first, then by how close to the door it is. */
const GROUP_ORDER: ShipmentStatus[] = ['exception', 'out_for_delivery', 'in_transit', 'pending', 'delivered'];

function istStamp(date: Date) {
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit' }).format(date);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  return `${day}  ${time}`;
}

function etaText(s: Shipment) {
  if (s.status === 'delivered') {
    const on = deliveredOn(s);
    const verdict = deliveryVerdict(s);
    return [on ? `Delivered ${format(on, 'd MMM')}` : 'Delivered', verdict?.label].filter(Boolean).join(' · ');
  }
  const eta = s.estimatedDelivery ? `ETA ${format(new Date(s.estimatedDelivery), 'd MMM')}` : 'No ETA';
  const urgency = getUrgency(s);
  if (urgency === 'late') {
    const d = daysLate(s);
    return `${eta} · *${d} day${d === 1 ? '' : 's'} late*`;
  }
  if (urgency === 'today') return `${eta} · due today`;
  if (urgency === 'tomorrow') return `${eta} · due tomorrow`;
  return eta;
}

/**
 * A WhatsApp-ready update for the shipments currently on screen, in the same plain
 * style as the stock update: *bold* headings, numbered lines, the issue spelled out.
 */
export function buildShipmentsMessage(
  shipments: Shipment[],
  { scope, includeLinks, origin }: { scope?: string; includeLinks: boolean; origin: string }
): string {
  const attention = shipments.filter(needsAttention).length;
  const lines = [`*SHIPMENT UPDATE  ${istStamp(new Date())}*`];
  lines.push(
    `${shipments.length} shipment${shipments.length === 1 ? '' : 's'}${
      attention ? ` · ${attention} need${attention === 1 ? 's' : ''} attention` : ''
    }${scope ? ` · ${scope}` : ''}`
  );

  for (const status of GROUP_ORDER) {
    const group = shipments.filter((s) => s.status === status);
    if (!group.length) continue;
    lines.push('', `*${STATUS_LABELS[status]} (${group.length})*`);
    group.forEach((s, i) => {
      const to = deliverTo(s);
      const where = to.place || to.line;
      const who = [s.customerInfo?.name, where].filter(Boolean).join(' · ');
      lines.push(`${i + 1}. ${s.trackingNumber} - ${s.carrierName || s.carrierCode}`);
      if (who) lines.push(`   ${who}`);
      const detail = [etaText(s)];
      if (s.status === 'exception') detail.push(attentionReason(s));
      lines.push(`   ${detail.join(' · ')}`);
      if (includeLinks) lines.push(`   ${origin}/track/${encodeURIComponent(s.trackingNumber)}`);
    });
  }
  if (shipments.length === 0) lines.push('', 'No shipments in this view.');
  return lines.join('\n');
}
