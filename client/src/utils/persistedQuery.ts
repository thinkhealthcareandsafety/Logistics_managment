/**
 * Keeps the last copy of a big list (shipments, stock) in the browser, so a refresh
 * shows it at once while a fresh copy loads quietly in the background. Cleared on
 * sign-out, so the next person on the machine never sees someone else's data.
 */
const PREFIX = 'th.cache.';

type Saved = { data: unknown; savedAt: number } | undefined;
// Parsed once per key: the shipment list is ~1.7 MB, too big to re-read on every render.
const memo = new Map<string, Saved>();

function readSaved(storageKey: string): Saved {
  if (memo.has(storageKey)) return memo.get(storageKey);
  let saved: Saved;
  try {
    const raw = localStorage.getItem(storageKey);
    saved = raw ? JSON.parse(raw) : undefined;
  } catch {
    saved = undefined;
  }
  memo.set(storageKey, saved);
  return saved;
}

export function persisted<T>(key: string, fetcher: () => Promise<T>) {
  const storageKey = PREFIX + key;
  const saved = readSaved(storageKey) as { data: T; savedAt: number } | undefined;
  return {
    queryFn: async () => {
      const data = await fetcher();
      const entry = { data, savedAt: Date.now() };
      memo.set(storageKey, entry);
      try {
        localStorage.setItem(storageKey, JSON.stringify(entry));
      } catch {
        // Storage full or blocked - the in-memory copy still serves this session.
      }
      return data;
    },
    initialData: saved?.data,
    // Marked as fetched when it was saved, so it is shown but refetched straight away.
    initialDataUpdatedAt: saved?.savedAt,
  };
}

export function clearPersisted() {
  memo.clear();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // nothing saved
  }
}
