const trackingMoreAdapter = require('./trackingmore.adapter');

// Every courier resolves to the TrackingMore adapter - its catalog covers ~1,700 of
// them, Indian couriers included. To add a source for a carrier TrackingMore doesn't
// cover, add an adapter implementing trackingAdapter.interface.js and map its carrier
// code(s) here; tracking.service.js needs no changes.
function getAdapterForCarrier(_carrierCode) {
  return trackingMoreAdapter;
}

module.exports = { getAdapterForCarrier };
