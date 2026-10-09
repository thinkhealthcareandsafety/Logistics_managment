import { format } from 'date-fns';
import type { Shipment } from '../types/shipment';
import { STATUS_LABELS } from './status';
import { deliveredOn } from './logistics';

const HEADERS = [
  'tracking_number',
  'status',
  'product_name',
  'sku',
  'quantity',
  'customer_name',
  'customer_email',
  'customer_phone',
  'current_location',
  'delivery_address',
  'delivery_city',
  'delivery_state',
  'delivery_pincode',
  'courier_destination',
  'weight_kg',
  'freight',
  'shipping_date',
  'estimated_delivery',
  'delivered_at',
  'last_checked',
];

function escapeCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/**
 * Saves rows as a .csv file on the user's computer. Starts with a UTF-8 byte-order
 * mark so Excel opens ₹, × and Indian names correctly instead of as garbled text.
 */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the download start before the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isoDate(value?: string): string {
  return value ? format(new Date(value), 'yyyy-MM-dd') : '';
}

export function exportShipmentsCsv(shipments: Shipment[]) {
  const rows = shipments.map((s) => [
    s.trackingNumber,
    STATUS_LABELS[s.status],
    s.productDetails?.name,
    s.productDetails?.sku,
    s.productDetails?.quantity,
    s.customerInfo?.name,
    s.customerInfo?.email,
    s.customerInfo?.phone,
    s.currentLocation,
    s.deliveryAddress?.line || s.customerInfo?.address,
    s.deliveryAddress?.city,
    s.deliveryAddress?.state,
    s.deliveryAddress?.pincode,
    [s.carrierRoute?.destinationCity, s.carrierRoute?.destinationState].filter(Boolean).join(', '),
    s.weightKg ?? '',
    s.freightAmount ?? '',
    isoDate(s.shippingDate),
    isoDate(s.estimatedDelivery),
    (() => {
      const on = deliveredOn(s);
      return on ? format(on, 'yyyy-MM-dd HH:mm') : '';
    })(),
    s.lastCheckedAt ? format(new Date(s.lastCheckedAt), 'yyyy-MM-dd HH:mm') : '',
  ]);

  downloadCsv(`shipments-${format(new Date(), 'yyyy-MM-dd')}.csv`, HEADERS, rows);
}
