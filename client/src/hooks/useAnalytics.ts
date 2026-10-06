import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';

export function useAnalytics(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['analytics', params],
    queryFn: () => analyticsApi.summary(params),
    refetchInterval: 60_000,
    // Changing the date range keeps the current numbers up (marked "Updating") instead
    // of blanking the page back to a skeleton.
    placeholderData: keepPreviousData,
  });
}
