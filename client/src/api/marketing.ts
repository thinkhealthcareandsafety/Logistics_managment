import { apiClient } from './client';

export interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  customerName: string;
  submittedAt: string;
}

export interface LeadInput {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  message?: string;
  plan?: string;
  monthlyShipments?: string;
}

export const marketingApi = {
  /** Public - only reviews the customer consented to and ops chose to feature. */
  reviews: () => apiClient.get<{ reviews: PublicReview[] }>('/public/reviews').then((r) => r.data.reviews),

  submitLead: (body: LeadInput) =>
    apiClient.post<{ received: boolean }>('/public/leads', body).then((r) => r.data),};
