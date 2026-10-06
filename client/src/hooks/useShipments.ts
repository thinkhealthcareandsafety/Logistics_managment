import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { shipmentsApi, type ShipmentFilters } from '../api/shipments';
import type { CreateShipmentInput, Shipment } from '../types/shipment';

/**
 * Courier updates (status, delivered date) are pushed over the socket the moment the
 * server sees them; the minute poll is the backstop if that connection drops, so the
 * screen never waits for someone to press Sync.
 */
const BACKSTOP_POLL_MS = 60_000;

export function useShipments(filters: ShipmentFilters) {
  return useQuery({
    queryKey: ['shipments', filters],
    queryFn: () => shipmentsApi.list(filters),
    refetchInterval: BACKSTOP_POLL_MS,
  });
}

export function useShipment(id: string | undefined) {
  return useQuery({
    queryKey: ['shipment', id],
    queryFn: () => shipmentsApi.get(id as string),
    enabled: !!id,
    refetchInterval: BACKSTOP_POLL_MS,
  });
}

export function useCreateShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateShipmentInput) => shipmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      toast.success('Shipment added and tracking started');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to add shipment');
    },
  });
}

export function useUpdateShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Shipment> & { isBeingFollowedUp?: boolean } }) =>
      shipmentsApi.update(id, data),
    onSuccess: (shipment) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipment', shipment._id] });
    },
  });
}

export function useAddShipmentNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => shipmentsApi.addNote(id, text),
    onSuccess: (shipment) => {
      queryClient.invalidateQueries({ queryKey: ['shipment', shipment._id] });
      toast.success('Note added');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to add note');
    },
  });
}

export function useRefreshAllShipments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => shipmentsApi.refreshAll(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      if (result.total === 0) toast('Nothing to refresh - all shipments are delivered or archived');
      else if (result.failed > 0) toast.error(`Refreshed ${result.refreshed}, ${result.failed} failed`);
      else toast.success(`Refreshed ${result.refreshed} shipment${result.refreshed === 1 ? '' : 's'}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Refresh failed');
    },
  });
}

export function useBulkArchiveShipments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, isArchived }: { ids: string[]; isArchived: boolean }) =>
      shipmentsApi.bulkArchive(ids, isArchived),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      toast.success(
        `${variables.isArchived ? 'Archived' : 'Restored'} ${result.modified} shipment${result.modified === 1 ? '' : 's'}`
      );
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Bulk update failed');
    },
  });
}

export function useBulkImportShipments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => shipmentsApi.bulkImport(file),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      if (result.imported > 0) toast.success(`Imported ${result.imported} shipment(s)`);
      if (result.failed.length > 0) toast.error(`${result.failed.length} row(s) failed - see details`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Bulk import failed');
    },
  });
}

export function useDeleteShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => shipmentsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      toast.success('Shipment removed');
    },
  });
}

export function useRefreshShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => shipmentsApi.refresh(id),
    onSuccess: (shipment) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipment', shipment._id] });
      toast.success('Tracking refreshed');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Refresh failed');
    },
  });
}
