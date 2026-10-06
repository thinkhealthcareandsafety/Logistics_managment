import { apiClient } from './client';
import type { ShipmentStatus } from '../types/shipment';

export interface Feedback {
  rating: number;
  comment: string;
  /** The customer agreed this review may appear on the public site. */
  consentToPublish: boolean;
  submittedAt: string;
  updatedAt: string;
}

export interface PublicFeedbackPage {
  trackingNumber: string;
  productName: string;
  status: ShipmentStatus;
  isDelivered: boolean;
  deliveredAt: string | null;
  feedback: Feedback | null;
}

export interface ShipmentFeedback {
  feedback: (Feedback & { customerName: string; isPublished: boolean }) | null;
  deliveryNoticeSentAt: string | null;
  /** Which channels are connected on the server - nothing can go out without one. */
  channels: { email: boolean; whatsapp: boolean };
  retryWindowDays: number;
}

export const feedbackApi = {
  /** Public - no auth. The tracking number is the credential. */
  getPublic: (trackingNumber: string) =>
    apiClient
      .get<PublicFeedbackPage>(`/public/feedback/${encodeURIComponent(trackingNumber)}`)
      .then((r) => r.data),

  submit: (trackingNumber: string, body: { rating: number; comment: string; consentToPublish: boolean }) =>
    apiClient
      .post<{ feedback: Feedback }>(`/public/feedback/${encodeURIComponent(trackingNumber)}`, body)
      .then((r) => r.data.feedback),

  /** Dashboard side - scoped to the signed-in user's own shipments. */
  forShipment: (shipmentId: string) =>
    apiClient.get<ShipmentFeedback>(`/shipments/${shipmentId}/feedback`).then((r) => r.data),

  resendDeliveryNotice: (shipmentId: string) =>
    apiClient
      .post<{ sent: boolean; sentAt: string }>(`/shipments/${shipmentId}/delivery-notice`)
      .then((r) => r.data),

  /** Feature (or un-feature) a review on the public site. Requires customer consent. */
  setPublished: (shipmentId: string, isPublished: boolean) =>
    apiClient
      .patch<{ isPublished: boolean }>(`/shipments/${shipmentId}/feedback`, { isPublished })
      .then((r) => r.data),
};
