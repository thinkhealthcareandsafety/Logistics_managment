/**
 * A carrier adapter is anything that can register a shipment for tracking and
 * later return its normalized checkpoints. `tracking.service.js` only ever
 * talks to adapters through this shape, so a brand-new data source (a future
 * scraper for some carrier with no API at all, a different aggregator, etc.)
 * can be dropped in without touching the rest of the app.
 *
 * @typedef {Object} NormalizedCheckpoint
 * @property {string} status - one of the internal STATUSES enum (see utils/statusMap.js)
 * @property {string} statusRaw - the source's own status string, kept for debugging/audit
 * @property {string} location
 * @property {string} description
 * @property {Date} checkpointTime
 * @property {string} source - identifies which adapter produced this checkpoint
 *
 * @typedef {Object} TrackingAdapter
 * @property {(shipment: import('mongoose').Document) => Promise<{externalId?: string}>} createTracking
 *   Registers the shipment with the underlying provider. Returns any id the provider
 *   assigns so it can be stored for future lookups.
 * @typedef {Object} CarrierRoute - what the carrier reports about the route; any field may be empty
 * @property {string} originCity
 * @property {string} originState
 * @property {string} destinationCity
 * @property {string} destinationState
 * @property {Date|null} pickupAt
 * @property {Date|null} deliveredAt
 * @property {number|null} weightKg
 *
 * @property {(shipment: import('mongoose').Document) => Promise<{checkpoints: NormalizedCheckpoint[], route: CarrierRoute|null}>} refreshTracking
 *   Fetches the current state: ALL known checkpoints (normalized, sorted oldest-first)
 *   plus whatever route details the provider exposes.
 */

module.exports = {};
