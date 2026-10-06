import { apiClient } from './client';
import type { Carrier } from '../types/shipment';

export interface CarrierCatalog {
  carriers: Carrier[];
  /** Well-known Indian couriers, offered first. */
  featured: string[];
  defaultCode: string;
}

export interface CourierSummary {
  total: number;
  countries: number;
  india: number;
  featured: string[];
}

export const carriersApi = {
  catalog: () => apiClient.get<CarrierCatalog>('/carriers').then((r) => r.data),

  /** TrackingMore's guess from the AWB format - suggestions, not an answer. */
  detect: (trackingNumber: string) =>
    apiClient
      .get<{ suggestions: Carrier[] }>('/carriers/detect', { params: { trackingNumber } })
      .then((r) => r.data.suggestions),

  /** Public - for the landing page. */
  summary: () => apiClient.get<CourierSummary>('/public/couriers/summary').then((r) => r.data),
};
