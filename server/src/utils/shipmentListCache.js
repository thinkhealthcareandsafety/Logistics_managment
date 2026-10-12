/**
 * The shipment list, kept ready between requests. Reading ~850 shipments from the
 * database takes a couple of seconds; the list itself only changes when a shipment
 * does, so any shipment write (see models/Shipment.js) simply empties the cache.
 */
let version = 0;
const cache = new Map();

function bump() {
  version += 1;
  cache.clear();
}

const currentVersion = () => version;

function get(key) {
  const hit = cache.get(key);
  return hit && hit.version === version ? hit.body : null;
}

/** Stores a body computed when the version was `atVersion` - dropped if a write happened since. */
function set(key, body, atVersion) {
  if (atVersion !== version) return;
  if (cache.size > 100) cache.clear();
  cache.set(key, { version, body });
}

module.exports = { bump, get, set, currentVersion };
