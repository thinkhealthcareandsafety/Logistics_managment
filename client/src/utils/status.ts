import type { ShipmentStatus } from '../types/shipment';

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: 'Pending',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  exception: 'Exception',
};

export const STATUS_STYLES: Record<ShipmentStatus, { bg: string; text: string; dot: string }> = {
  pending: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
  in_transit: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  out_for_delivery: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  delivered: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  exception: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

export const ALL_STATUSES: ShipmentStatus[] = ['pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception'];

/**
 * The happy path a customer is walked through on the public tracking page.
 * `exception` is deliberately excluded - it's a detour, not a step.
 */
export const DELIVERY_STEPS: ShipmentStatus[] = ['pending', 'in_transit', 'out_for_delivery', 'delivered'];
