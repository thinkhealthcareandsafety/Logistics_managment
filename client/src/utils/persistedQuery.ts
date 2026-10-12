/**
 * Keeps the last copy of a big list (shipments, stock) in the browser, so a refresh
 * shows it at once while a fresh copy loads quietly in the background. Cleared on
 * sign-out, so the next person on the machine never sees someone else's data.
 */
const PREFIX = 'th.cache.';

export function persisted<T>(key: string, fetcher: () => Promise<T>) {
  const storageKey = PREFIX + key;
  let saved: { data: T; savedAt: number } | undefined;
  try {
    const raw = localStorage.getItem(storageKey);
    saved = raw ? JSON.parse(raw) : undefined;
  } catch {
    saved = undefined;
  }
  return {
    queryFn: async () => {
      const data = await fetcher();
      try {
        localStorage.setItem(storageKey, JSON.stringify({ data, savedAt: Date.now() }));
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
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // nothing saved
  }
}
