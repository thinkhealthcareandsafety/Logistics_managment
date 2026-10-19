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

export interface MediaStatus {
  at: string | null;
  products: number;
  matched: number;
  error: string;
  running: boolean;
}

/** The sheet actions of one stock book - '/stock' (Zoho-linked) or '/manual-stock' (kept by hand). */
export function ledgerApi(base: string) {
  return {
    get: () => apiClient.get<StockSnapshot>(base).then((r) => r.data),

    message: () =>
      apiClient.get<{ text: string; parts: number; generatedAt: string }>(`${base}/message`).then((r) => r.data),

    movements: (limit = 30, direction?: 'in' | 'out') =>
      apiClient.get<{ movements: StockMovement[] }>(`${base}/movements`, { params: { limit, direction } }).then((r) => r.data.movements),

    saveCount: (changes: StockCountChange[]) =>
      apiClient.post<StockSnapshot & { updated: number }>(`${base}/count`, { changes }).then((r) => r.data),

    stockOut: (id: string, body: { quantity: number; customer?: string; note?: string }) =>
      apiClient
        .post<{ item: StockItem; movement: StockMovement }>(`${base}/items/${id}/stock-out`, body)
        .then((r) => r.data),

    createItem: (body: StockItemInput) => apiClient.post<{ item: StockItem }>(`${base}/items`, body).then((r) => r.data.item),

    updateItem: (id: string, body: StockItemInput) =>
      apiClient.patch<{ item: StockItem }>(`${base}/items/${id}`, body).then((r) => r.data.item),

    removeItem: (id: string) => apiClient.delete(`${base}/items/${id}`),

    createCategory: (body: { name: string; listStyle?: ListStyle }) =>
      apiClient.post<{ category: StockCategory }>(`${base}/categories`, body).then((r) => r.data.category),

    updateCategory: (id: string, body: Partial<Pick<StockCategory, 'name' | 'listStyle'>>) =>
      apiClient.patch<{ category: StockCategory }>(`${base}/categories/${id}`, body).then((r) => r.data.category),

    deleteCategory: (id: string) => apiClient.delete(`${base}/categories/${id}`),

    updateSettings: (body: { hideZeroInMessage?: boolean; broadcast?: Partial<StockSettings['broadcast']> }) =>
      apiClient.patch<{ settings: StockSettings }>(`${base}/settings`, body).then((r) => r.data.settings),

    rotateShareToken: () =>
      apiClient.post<{ settings: StockSettings }>(`${base}/share-token/rotate`).then((r) => r.data.settings),
  };
}

export const stockApi = {
  ...ledgerApi('/stock'),

  sendNow: () =>
    apiClient
      .post<{ sent: number; failed: number; total: number; messagesPerRecipient: number }>('/stock/broadcast')
      .then((r) => r.data),

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

  merge: (keepId: string, otherIds: string[]) => apiClient.post<{ item: StockItem }>(`/stock/items/${keepId}/merge`, { otherIds }).then((r) => r.data.item),
  unmerge: (id: string, zohoItemId: string) => apiClient.post<{ item: StockItem }>(`/stock/items/${id}/unmerge`, { zohoItemId }).then((r) => r.data.item),

  refreshMedia: () => apiClient.post<{ media: MediaStatus }>('/stock/media/refresh').then((r) => r.data.media),
  mediaStatus: () => apiClient.get<{ media: MediaStatus }>('/stock/media/status').then((r) => r.data.media),

  publicStock: (token: string, publicBase = '/public/stock') =>
    apiClient.get<PublicStock>(`${publicBase}/${token}`).then((r) => r.data),
};
