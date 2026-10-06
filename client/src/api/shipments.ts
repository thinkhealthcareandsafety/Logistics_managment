import { apiClient } from './client';
import type { BulkImportResult, CreateShipmentInput, LabelDraft, Shipment } from '../types/shipment';

export interface ShipmentFilters {
  status?: string;
  search?: string;
  archived?: boolean;
}

export const shipmentsApi = {
  list: (filters: ShipmentFilters = {}) =>
    apiClient
      .get<{ shipments: Shipment[] }>('/shipments', {
        params: { ...filters, archived: String(!!filters.archived) },
      })
      .then((r) => r.data.shipments),

  get: (id: string) => apiClient.get<{ shipment: Shipment }>(`/shipments/${id}`).then((r) => r.data.shipment),

  create: (data: CreateShipmentInput) =>
    apiClient.post<{ shipment: Shipment }>('/shipments', data).then((r) => r.data.shipment),

  update: (id: string, data: Partial<Shipment> & { isBeingFollowedUp?: boolean }) =>
    apiClient.patch<{ shipment: Shipment }>(`/shipments/${id}`, data).then((r) => r.data.shipment),

  remove: (id: string) => apiClient.delete(`/shipments/${id}`),

  refresh: (id: string) =>
    apiClient.post<{ shipment: Shipment }>(`/shipments/${id}/refresh`).then((r) => r.data.shipment),

  addNote: (id: string, text: string) =>
    apiClient.post<{ shipment: Shipment }>(`/shipments/${id}/notes`, { text }).then((r) => r.data.shipment),

  refreshAll: () =>
    apiClient
      .post<{ refreshed: number; failed: number; total: number }>('/shipments/refresh-all')
      .then((r) => r.data),

  bulkArchive: (ids: string[], isArchived: boolean) =>
    apiClient
      .patch<{ matched: number; modified: number }>('/shipments/bulk', { ids, isArchived })
      .then((r) => r.data),

  /** Reads a label photo into a draft - saves nothing. */
  extractFromLabel: (file: Blob, filename: string) => {
    const formData = new FormData();
    formData.append('file', file, filename);
    return apiClient
      .post<{ draft: LabelDraft }>('/shipments/extract', formData, { timeout: 120_000 })
      .then((r) => r.data.draft);
  },

  bulkImport: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post<BulkImportResult>('/shipments/bulk-import', formData).then((r) => r.data);
  },
};
