import { apiClient } from './client';
import type { ShipmentStatus } from '../types/shipment';

/** One courier's numbers over the selected range. */
export interface ExceptionRateByCarrier {
  carrierCode: string;
  carrierName: string;
  total: number;
  exceptions: number;
  rate: number;
  delivered: number;
  averageTransitHours: number | null;
  onTimeEligible: number;
  onTimeCount: number;
  onTimeRate: number | null;
}

export interface WeekdayRow {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  orders: number;
  units: number;
  deliveries: number;
}

export interface LocationRow {
  key: string;
  /** "Pune, Maharashtra" for cities, "Maharashtra" for states. */
  label: string;
  orders: number;
  units: number;
  /** Sum of freight in ₹ (shipments without freight count as 0). */
  freight: number;
}

export interface AnalyticsSummary {
  totalShipments: number;
  totalDelivered: number;
  averageTransitHours: number | null;
  fastestTransitHours: number | null;
  slowestTransitHours: number | null;
  onTimeDeliveryRate: number | null;
  onTimeEligible: number;
  onTimeCount: number;
  statusBreakdown: Record<ShipmentStatus, number>;
  lateCount: number;
  averageRating: number | null;
  feedbackCount: number;
  /** Delivered shipments — the pool that could have left feedback. */
  feedbackEligible: number;
  ratingBreakdown: Record<'1' | '2' | '3' | '4' | '5', number>;
  exceptionRateByCarrier: ExceptionRateByCarrier[];
  exceptionCount: number;
  exceptionRate: number;
  /** Monday-first, India time. */
  weekdayBreakdown: WeekdayRow[];
  /** Busiest first. Address entered for the client, else the courier's destination. */
  locationBreakdown: { cities: LocationRow[]; states: LocationRow[]; unknown: number };
  dateRange: { from: string | null; to: string | null };
}

export const analyticsApi = {
  summary: (params: { from?: string; to?: string } = {}) =>
    apiClient.get<AnalyticsSummary>('/analytics/summary', { params }).then((r) => r.data),
};
