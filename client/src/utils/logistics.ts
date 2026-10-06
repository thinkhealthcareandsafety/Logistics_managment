import type { Shipment } from '../types/shipment';

export function formatWeight(kg?: number | null): string {
  if (kg == null) return '—';
  return `${kg.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;
}

export function formatINR(amount?: number | null): string {
  if (amount == null) return '—';
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export interface DeliverTo {
  /** Street-level line, when the booking has one. */
  line: string;
  /** "Pune, Maharashtra 411005" */
  place: string;
  /** Where the place came from: the booking/address entered here, or the courier. */
  source: 'address' | 'courier' | null;
}

/**
 * Best available answer to "where is this going": the address entered for the
 * client, else the destination the courier reports (city + state only), else nothing.
 * Older shipments kept a free-text address on the customer - used as the line.
 */
export function deliverTo(s: Shipment): DeliverTo {
  const a = s.deliveryAddress;
  const legacyLine = s.customerInfo?.address || '';
  const place = [a?.city, a?.state].filter(Boolean).join(', ');
  const placeWithPin = [place, a?.pincode].filter(Boolean).join(' ');
  if (a && (a.line || place || a.pincode)) {
    return { line: a.line || legacyLine, place: placeWithPin, source: 'address' };
  }
  const r = s.carrierRoute;
  const courierPlace = [r?.destinationCity, r?.destinationState].filter(Boolean).join(', ');
  if (courierPlace) return { line: legacyLine, place: courierPlace, source: 'courier' };
  if (legacyLine) return { line: legacyLine, place: '', source: 'address' };
  return { line: '', place: '', source: null };
}

export interface ProcessingTime {
  start: Date | null;
  /** What `start` is: the first courier scan, the pickup, or the entered shipping date. */
  startSource: 'first scan' | 'pickup' | 'shipping date' | null;
  end: Date | null;
  /** Not delivered yet - `durationMs` is time elapsed so far. */
  inProgress: boolean;
  durationMs: number | null;
}

/**
 * Start-to-finish for one consignment. Start = the first courier scan (when the
 * booking was registered), falling back to the courier's pickup date, then the
 * shipping date. End = the "delivered" scan (or the courier's delivery milestone).
 * Undelivered shipments run against "now", so the total reads as time so far.
 */
export function processingTime(s: Shipment, now = new Date()): ProcessingTime {
  const scans = [...(s.checkpoints || [])].sort(
    (a, b) => new Date(a.checkpointTime).getTime() - new Date(b.checkpointTime).getTime()
  );

  let start: Date | null = null;
  let startSource: ProcessingTime['startSource'] = null;
  if (scans.length) {
    start = new Date(scans[0].checkpointTime);
    startSource = 'first scan';
  } else if (s.carrierRoute?.pickupAt) {
    start = new Date(s.carrierRoute.pickupAt);
    startSource = 'pickup';
  } else if (s.shippingDate) {
    start = new Date(s.shippingDate);
    startSource = 'shipping date';
  }

  const deliveredScan = [...scans].reverse().find((c) => c.status === 'delivered');
  const delivered = s.status === 'delivered';
  const end = deliveredScan
    ? new Date(deliveredScan.checkpointTime)
    : delivered && s.carrierRoute?.deliveredAt
      ? new Date(s.carrierRoute.deliveredAt)
      : null;

  const inProgress = !delivered;
  const until = end ?? (inProgress ? now : null);
  const durationMs = start && until ? Math.max(0, until.getTime() - start.getTime()) : null;
  return { start, startSource, end, inProgress, durationMs };
}

/** When a delivered shipment arrived: the stored date, else the delivered scan / milestone. */
export function deliveredOn(s: Shipment): Date | null {
  if (s.status !== 'delivered') return null;
  if (s.deliveredAt) return new Date(s.deliveredAt);
  return processingTime(s).end;
}

/** Delivered vs promised, in calendar days (India time): "On time", "2 days late", "1 day early". */
export function deliveryVerdict(s: Shipment): { label: string; late: boolean } | null {
  const on = deliveredOn(s);
  if (!on || !s.estimatedDelivery) return null;
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  const diff = Math.round((Date.parse(day(on)) - Date.parse(day(new Date(s.estimatedDelivery)))) / 86_400_000);
  if (diff === 0) return { label: 'On time', late: false };
  const n = Math.abs(diff);
  return { label: `${n} day${n === 1 ? '' : 's'} ${diff > 0 ? 'late' : 'early'}`, late: diff > 0 };
}

/** "3 days 4 hrs", "5 hrs 20 min", "45 min". */
export function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  const totalMin = Math.round(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hrs = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (days > 0) return hrs ? `${plural(days, 'day')} ${plural(hrs, 'hr')}` : plural(days, 'day');
  if (hrs > 0) return mins ? `${plural(hrs, 'hr')} ${mins} min` : plural(hrs, 'hr');
  return `${Math.max(mins, 1)} min`;
}

const norm = (v?: string) => (v || '').toLowerCase().replace(/[^a-z]/g, '').replace(/^nctof/, '');

/**
 * The entered address and the courier's destination disagree on the state - usually
 * a wrong address on the booking, worth catching before the parcel goes astray.
 * States only: city names vary too much (Gurgaon/Gurugram, South Delhi/Delhi).
 */
export function destinationMismatch(s: Shipment): string | null {
  const entered = s.deliveryAddress?.state;
  const courier = s.carrierRoute?.destinationState;
  if (!entered || !courier || norm(entered) === norm(courier)) return null;
  const where = [s.carrierRoute?.destinationCity, courier].filter(Boolean).join(', ');
  return `The courier shows this going to ${where}, but the delivery address is in ${entered}.`;
}
