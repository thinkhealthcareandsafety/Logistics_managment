import type { ShipmentStatus } from './shipment';

export interface AppNotification {
  _id: string;
  userId: string;
  shipmentId: string;
  type: 'status_change';
  status: ShipmentStatus;
  message: string;
  read: boolean;
  createdAt: string;
}
