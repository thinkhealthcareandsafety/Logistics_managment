// Internal status vocabulary used across the whole app, regardless of carrier/source.
// Deliberately kept to 5 decision-relevant states - anything more granular than this
// doesn't change what an ops person would do about a shipment.
const STATUSES = ['pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception'];

// TrackingMore v4 top-level `status` values, see https://www.trackingmore.com/docs
const TRACKINGMORE_STATUS_MAP = {
  pending: 'pending',
  notfound: 'pending',
  inforeceived: 'pending',
  info_received: 'pending',
  transit: 'in_transit',
  pickup: 'in_transit',
  delivered: 'delivered',
  undelivered: 'exception',
  exception: 'exception',
  // A shipment TrackingMore gives up polling (no updates for too long) needs the
  // same human follow-up as a delay or failed attempt, so it's an exception too.
  expired: 'exception',
};

/**
 * Maps a TrackingMore status/substatus pair to our internal status enum.
 * Falls back to keyword-matching the substatus/description when the top-level
 * status is ambiguous (e.g. "transit" covers both in-transit and out-for-delivery).
 */
function mapTrackingMoreStatus(rawStatus, rawSubstatus = '', description = '') {
  const substatus = (rawSubstatus || '').toLowerCase();
  const text = (description || '').toLowerCase();

  if (substatus.includes('outfordelivery') || text.includes('out for delivery')) {
    return 'out_for_delivery';
  }
  if (substatus.includes('delivered') || rawStatus === 'delivered') {
    return 'delivered';
  }

  const normalized = (rawStatus || '').toLowerCase();
  const mapped = TRACKINGMORE_STATUS_MAP[normalized] || 'pending';
  // Smaller couriers (e.g. Mark Express) send scans with no per-scan status, or one
  // stuck on "pending" - the words still say the parcel is moving.
  if (mapped === 'pending' && MOVING.test(text)) return 'in_transit';
  return mapped;
}

/** Scan wording that means the parcel has left the sender (not "pickup scheduled" / "booked"). */
const MOVING =
  /\b(in[\s-]?transit|dispatched|departed|arrived|reached|forwarded|picked[\s-]?up|pickup (done|completed|successful)|connected (to|at)|received at|bagged|out from)\b/;

/** How far along each status is - a shipment never moves back from what the courier has confirmed. */
const PROGRESS = { pending: 0, in_transit: 1, out_for_delivery: 2, delivered: 3 };

module.exports = { STATUSES, mapTrackingMoreStatus, PROGRESS };
