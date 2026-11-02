import { apiClient } from './client';

export interface CreditUse {
  _id: string;
  at: string;
  trackingNumber: string;
  carrierCode: string;
  /** new-shipment | refresh | background | delivery-dates */
  source: string;
  byName: string;
}

export interface TrackingCredits {
  allowance: number;
  used: number;
  left: number;
  periodStart: string;
  /** Next refill - null on a plan that doesn't refill (the free one). */
  renewsAt: string | null;
  resetsMonthly: boolean;
  autoRegister: boolean;
  updatedByName: string;
  recent?: CreditUse[];
}

export interface CreditSettingsPatch {
  allowance?: number;
  periodStart?: string;
  resetsMonthly?: boolean;
  /** What TrackingMore's own dashboard says is used - corrects the app's count. */
  usedSoFar?: number;
  autoRegister?: boolean;
}

export const creditsApi = {
  get: () => apiClient.get<TrackingCredits>('/system/tracking-credits').then((r) => r.data),
  update: (patch: CreditSettingsPatch) => apiClient.patch<TrackingCredits>('/system/tracking-credits', patch).then((r) => r.data),
};
