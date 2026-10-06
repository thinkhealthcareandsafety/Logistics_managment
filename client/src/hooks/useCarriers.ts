import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { carriersApi } from '../api/carriers';
import type { Carrier } from '../types/shipment';

/** The ~1,700-courier catalog. Fetched once per session - it barely changes. */
export function useCarriers() {
  const query = useQuery({
    queryKey: ['carriers'],
    queryFn: carriersApi.catalog,
    staleTime: Infinity,
    gcTime: Infinity,
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
