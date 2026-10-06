import type { ShipmentStatus } from './shipment';

export interface NotificationPreferences {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  whatsappEnabled: boolean;
  whatsappNumber: string;
  notifyOnStatuses: ShipmentStatus[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  company: string;
  notificationPreferences: NotificationPreferences;
  createdAt: string;
}
