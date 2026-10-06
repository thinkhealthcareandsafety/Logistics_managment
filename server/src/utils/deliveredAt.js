/**
 * The moment a shipment was delivered, from the best evidence available: the courier's
 * "delivered" scan (exact time, e.g. 7 Sep 11:14 AM), then TrackingMore's delivery
 * milestone, then whatever was already recorded. null when it isn't delivered.
 */
function resolveDeliveredAt(shipment) {
  if (shipment.status !== 'delivered') return null;
  const scan = [...(shipment.checkpoints || [])].reverse().find((c) => c.status === 'delivered');
  return scan?.checkpointTime || shipment.carrierRoute?.deliveredAt || shipment.deliveredAt || null;
}

/** Sets shipment.deliveredAt in place; returns true when it changed. */
function syncDeliveredAt(shipment) {
  const next = resolveDeliveredAt(shipment);
  const prev = shipment.deliveredAt || null;
  if ((prev && next && new Date(prev).getTime() === new Date(next).getTime()) || (!prev && !next)) return false;
  shipment.deliveredAt = next;
  return true;
}

module.exports = { resolveDeliveredAt, syncDeliveredAt };
