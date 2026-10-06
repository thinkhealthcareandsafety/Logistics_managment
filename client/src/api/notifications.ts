import { apiClient } from './client';
import type { AppNotification } from '../types/notification';
import type { NotificationPreferences } from '../types/user';

export const notificationsApi = {
  list: () =>
    apiClient
      .get<{ notifications: AppNotification[]; unreadCount: number }>('/notifications')
      .then((r) => r.data),

  markRead: (id: string) =>
    apiClient.patch<{ notification: AppNotification }>(`/notifications/${id}/read`).then((r) => r.data.notification),

  markAllRead: () => apiClient.patch<{ updated: number }>('/notifications/read-all').then((r) => r.data),

  getPreferences: () =>
    apiClient
      .get<{ notificationPreferences: NotificationPreferences }>('/notifications/preferences')
      .then((r) => r.data.notificationPreferences),

  updatePreferences: (data: Partial<NotificationPreferences>) =>
    apiClient
      .patch<{ notificationPreferences: NotificationPreferences }>('/notifications/preferences', data)
      .then((r) => r.data.notificationPreferences),
};
