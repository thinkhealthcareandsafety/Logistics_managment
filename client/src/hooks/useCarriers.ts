import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { carriersApi, type CarrierCatalog } from '../api/carriers';
import type { Carrier } from '../types/shipment';

/**
 * The ~1,700-courier catalog. Kept in the browser for a day, so the courier picker
 * opens instantly - even on a fresh page load - while a fresh copy is fetched quietly
 * in the background when the saved one is old.
 */
const STORAGE_KEY = 'th.courierCatalog.v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function readSaved(): { data: CarrierCatalog; savedAt: number } | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed?.data?.carriers?.length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function fetchAndSave(): Promise<CarrierCatalog> {
  const data = await carriersApi.catalog();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {
    // Storage full or blocked - the in-memory copy still serves this session.
  }
  return data;
}

export const carriersQuery = {
  queryKey: ['carriers'] as const,
  queryFn: fetchAndSave,
  staleTime: MAX_AGE_MS,
  gcTime: Infinity,
};

export function useCarriers() {
  const saved = readSaved();
  const query = useQuery({
    ...carriersQuery,
    initialData: saved?.data,
    initialDataUpdatedAt: saved?.savedAt,
  });
  const byCode = useMemo(
    () => new Map<string, Carrier>((query.data?.carriers ?? []).map((c) => [c.code, c])),
    [query.data]
  );
  return { ...query, byCode };
}

export function useCourierSummary() {
  return useQuery({ queryKey: ['courier-summary'], queryFn: carriersApi.summary, staleTime: 60 * 60 * 1000 });
}
