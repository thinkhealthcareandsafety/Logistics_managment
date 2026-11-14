/**
 * "Couriers" this business uses that no tracking service can follow: the client
 * collecting from the office, a Porter rider, a transport company or bus. They're in
 * the courier list so a shipment can say how it went, but they never touch
 * TrackingMore - no credit, no call - and their status is set by hand (or by Zoho).
 */
const APP_COURIERS = [
  { code: 'self', name: 'Self pickup (from office)', note: 'The client collected it from the office - no courier, no weight or freight.' },
  { code: 'porter', name: 'Porter', note: 'Sent with a Porter rider - no courier AWB to track.' },
  { code: 'transport', name: 'Transport company', note: 'Sent through a transport company - update its status by hand.' },
  { code: 'bus', name: 'Bus parcel', note: 'Sent as a bus parcel - update its status by hand.' },
  { code: 'other', name: 'Other (not tracked)', note: 'Not tracked by a courier - update its status by hand.' },
].map((c) => ({ ...c, country: 'IN', logo: '', url: '', phone: '', requiredFields: [], tracked: false }));

/** The client takes it away at the office: delivered the moment it's handed over. */
const HAND_DELIVERED = ['porter', 'self'];
const NOT_TRACKABLE = ['bus', 'transport', 'other', 'skyking-india', ...HAND_DELIVERED];

const isTrackable = (code) => !NOT_TRACKABLE.includes(String(code || '').toLowerCase());

module.exports = { APP_COURIERS, HAND_DELIVERED, NOT_TRACKABLE, isTrackable };
