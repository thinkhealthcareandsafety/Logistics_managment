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
  /** Share of shipments that ever hit an exception (not just ones stuck now). */
  troubleRate: number;
  /** Shipments with a freight figure (from Zoho invoices or the master sheet). */
  freightCount: number;
  freightTotal: number;
  medianFreight: number | null;
  medianFreightPerKg: number | null;
}

export interface CourierScore {
  carrierCode: string;
  carrierName: string;
  shipments: number;
  /** 0-100: reliability 40%, route-fair speed 35%, cost 25%. */
  score: number;
  speed: number;
  reliability: number;
  cost: number;
  costKnown: boolean;
  speedKnown: boolean;
  /** 1 = typical for its destinations, 2 = twice as fast. */
  speedIndex: number | null;
  comparableTrips: number;
  medianFreight: number | null;
  /** 2 = speed and cost measured, 1 = one of them, 0 = neither. */
  evidence: number;
}

interface CourierPick {
  carrierCode: string;
  carrierName: string;
  value: number;
}

export interface CourierAdvice {
  recommended: CourierScore | null;
  ranking: CourierScore[];
  fastest: CourierPick | null;
  mostReliable: CourierPick | null;
  cheapest: CourierPick | null;
  cheapestPerKg: CourierPick | null;
  freightCoverage: { withFreight: number; shipments: number };
  byState: {
    state: string;
    shipments: number;
    recommended: { carrierName: string; shipments: number; averageTransitHours: number | null; troubleRate: number; medianFreight: number | null };
    options: { carrierCode: string; carrierName: string; shipments: number; averageTransitHours: number | null; troubleRate: number; medianFreight: number | null }[];
  }[];
}

export interface ReorderPrediction {
  customer: string;
  item: string;
  itemId: string;
  orders: number;
  everyDays: number;
  typicalQty: number;
  recentQty: number;
  perMonth: number | null;
  lastOrderAt: string;
  nextOrderAt: string;
  /** Negative = that many days late. */
  daysUntil: number;
  status: 'due' | 'upcoming' | 'overdue' | 'lapsed';
  confidence: 'high' | 'medium' | 'low';
}

export interface ReorderReport {
  /** Where the patterns were read from - invoices once their history has been read. */
  source: 'invoices' | 'shipments';
  history: { listed: number; cached: number; lastRunAt: string | null; running: boolean; lastError: string };
  predictions: ReorderPrediction[];
  demand: { item: string; itemId: string; expectedQty: number; clients: number; inStock: number | null; short: boolean }[];
}

export interface WeekdayRow {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  /** Booked that day. */
  orders: number;
  /** Picked up by the courier that day (left the warehouse). */
  shipments: number;
  units: number;
  deliveries: number;
  /** Units that left the stock shelf that day (Zoho invoices, stock-outs). */
  dispatch: number;
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
  courierAdvice: CourierAdvice | null;
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

  reorders: () => apiClient.get<ReorderReport>('/analytics/reorders').then((r) => r.data),
};
