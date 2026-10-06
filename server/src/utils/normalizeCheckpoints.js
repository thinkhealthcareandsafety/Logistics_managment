const { mapTrackingMoreStatus } = require('./statusMap');

/**
 * TrackingMore's v4 "get tracking results" response nests raw checkpoints under
 * `origin_info.trackinfo` (and `destination_info.trackinfo` for some carriers).
 * Field names have shifted across TrackingMore API versions, so this reads
 * defensively across the aliases we've seen in their docs/changelog rather than
 * assuming one exact shape.
 */
function normalizeTrackingMoreCheckpoints(tracking) {
  const rawPoints = [
    ...(tracking?.origin_info?.trackinfo || []),
    ...(tracking?.destination_info?.trackinfo || []),
  ];

  const checkpoints = rawPoints.map((point) => {
    const rawStatus =
      point.checkpoint_delivery_status || point.status || tracking.delivery_status || '';
    const rawSubstatus =
      point.checkpoint_delivery_substatus || point.substatus || tracking.substatus || '';
    const description = point.tracking_detail || point.checkpoint_delivery_desc || point.description || '';

    return {
      status: mapTrackingMoreStatus(rawStatus, rawSubstatus, description),
      statusRaw: rawStatus || rawSubstatus || 'unknown',
      location: point.location || point.checkpoint_location || '',
      description,
      checkpointTime: new Date(point.checkpoint_date || point.date || Date.now()),
      source: 'trackingmore',
    };
  });

  // Oldest first so the UI timeline and "latest checkpoint" logic both read naturally
  checkpoints.sort((a, b) => a.checkpointTime - b.checkpointTime);
  return checkpoints;
}

module.exports = { normalizeTrackingMoreCheckpoints };
