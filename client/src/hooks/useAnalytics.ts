import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';

export function useAnalytics(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['analytics', params],
    queryFn: () => analyticsApi.summary(params),
    refetchInterval: 60_000,
  });
}
