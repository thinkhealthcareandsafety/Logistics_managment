/**
 * The shipment list, kept ready between requests. Reading ~850 shipments from the
 * database takes a couple of seconds; the list itself only changes when a shipment
 * does, so any shipment write (see models/Shipment.js) empties the cache - and the
 * lists people were reading are rebuilt in the background a moment later, so the
 * next person to open the page (often after a courier sync touched every shipment)
 * still gets a ready copy instead of waiting on the database.
 */
const REBUILD_DELAY_MS = 1500;

let version = 0;
const cache = new Map();
// key -> () => Promise<string>: how to rebuild each list someone has asked for.
const builders = new Map();
let rebuildTimer = null;

function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  // Debounced: a sync writes hundreds of shipments in a row; rebuild once it settles.
  rebuildTimer = setTimeout(async () => {
    for (const [key, build] of builders) {
      if (cache.has(key)) continue;
      const atVersion = version;
      try {
        set(key, await build(), atVersion);
      } catch {
        // The next request builds it the normal way.
      }
    }
  }, REBUILD_DELAY_MS);
  rebuildTimer.unref?.();
}

function bump() {
  version += 1;
  cache.clear();
  if (builders.size) scheduleRebuild();
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

/** Remembers how to rebuild `key`, so writes refill it instead of leaving it empty. */
function remember(key, build) {
  if (!builders.has(key) && builders.size >= 20) builders.delete(builders.keys().next().value);
  builders.set(key, build);
}

module.exports = { bump, get, set, remember, currentVersion };
