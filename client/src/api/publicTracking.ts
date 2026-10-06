import { apiClient } from './client';
import type { PublicTracking } from '../types/shipment';

export const publicTrackingApi = {
  get: (trackingNumber: string) =>
    apiClient.get<PublicTracking>(`/public/tracking/${encodeURIComponent(trackingNumber)}`).then((r) => r.data),
};
