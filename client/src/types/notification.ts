import type { ShipmentStatus } from './shipment';

export interface AppNotification {
  _id: string;
  userId: string;
  shipmentId: string | null;
  type: 'status_change' | 'stock_in';
  status: ShipmentStatus | '';
  message: string;
  read: boolean;
  createdAt: string;
}
