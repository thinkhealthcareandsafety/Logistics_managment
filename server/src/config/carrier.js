// Any courier in TrackingMore's catalog can be tracked (see services/courierCatalog).
// This is only the default: what a new shipment uses when no courier is given -
// e.g. older CSVs without a carrier_code column, or an ingest call that omits it.
module.exports = {
  DEFAULT_CARRIER_CODE: 'shreemaruticourier',
  DEFAULT_CARRIER_NAME: 'Shree Maruti Courier',
};
