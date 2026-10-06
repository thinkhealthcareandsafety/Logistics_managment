import { apiClient } from './client';
import type {
  ListStyle,
  PublicStock,
  StockCategory,
  StockCountChange,
  StockItem,
  StockItemInput,
  StockMovement,
  StockSettings,
  StockSnapshot,
  ZohoStatus,
} from '../types/stock';

export const stockApi = {
  get: () => apiClient.get<StockSnapshot>('/stock').then((r) => r.data),

  message: () =>
    apiClient.get<{ text: string; parts: number; generatedAt: string }>('/stock/message').then((r) => r.data),

  movements: (limit = 30) =>
    apiClient.get<{ movements: StockMovement[] }>('/stock/movements', { params: { limit } }).then((r) => r.data.movements),

  saveCount: (changes: StockCountChange[]) =>
    apiClient.post<StockSnapshot & { updated: number }>('/stock/count', { changes }).then((r) => r.data),

  stockOut: (id: string, body: { quantity: number; customer?: string; note?: string }) =>
    apiClient
      .post<{ item: StockItem; movement: StockMovement }>(`/stock/items/${id}/stock-out`, body)
      .then((r) => r.data),

  createItem: (body: StockItemInput) => apiClient.post<{ item: StockItem }>('/stock/items', body).then((r) => r.data.item),

  updateItem: (id: string, body: StockItemInput) =>
    apiClient.patch<{ item: StockItem }>(`/stock/items/${id}`, body).then((r) => r.data.item),

  removeItem: (id: string) => apiClient.delete(`/stock/items/${id}`),

  createCategory: (body: { name: string; listStyle?: ListStyle }) =>
    apiClient.post<{ category: StockCategory }>('/stock/categories', body).then((r) => r.data.category),

  updateCategory: (id: string, body: Partial<Pick<StockCategory, 'name' | 'listStyle'>>) =>
    apiClient.patch<{ category: StockCategory }>(`/stock/categories/${id}`, body).then((r) => r.data.category),

  deleteCategory: (id: string) => apiClient.delete(`/stock/categories/${id}`),

  updateSettings: (body: { hideZeroInMessage?: boolean; broadcast?: Partial<StockSettings['broadcast']> }) =>
    apiClient.patch<{ settings: StockSettings }>('/stock/settings', body).then((r) => r.data.settings),

  sendNow: () =>
    apiClient
      .post<{ sent: number; failed: number; total: number; messagesPerRecipient: number }>('/stock/broadcast')
      .then((r) => r.data),

  rotateShareToken: () =>
    apiClient.post<{ settings: StockSettings }>('/stock/share-token/rotate').then((r) => r.data.settings),

  zoho: {
    status: () => apiClient.get<{ zoho: ZohoStatus }>('/integrations/zoho').then((r) => r.data.zoho),
    connect: () => apiClient.post<{ url: string }>('/integrations/zoho/connect').then((r) => r.data.url),
    update: (body: { organizationId?: string; autoCreate?: boolean }) =>
      apiClient.patch<{ zoho: ZohoStatus }>('/integrations/zoho', body).then((r) => r.data.zoho),
    sync: () =>
      apiClient
        .post<{ summary?: ZohoStatus['lastSyncSummary']; running?: boolean; zoho: ZohoStatus }>('/integrations/zoho/sync')
        .then((r) => r.data),
    rotateWebhook: () =>
      apiClient.post<{ zoho: ZohoStatus }>('/integrations/zoho/webhook-token/rotate').then((r) => r.data.zoho),
    disconnect: () => apiClient.delete<{ zoho: ZohoStatus }>('/integrations/zoho').then((r) => r.data.zoho),
  },

  publicStock: (token: string) => apiClient.get<PublicStock>(`/public/stock/${token}`).then((r) => r.data),
};
