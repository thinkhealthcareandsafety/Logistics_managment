import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { persisted } from '../utils/persistedQuery';
import toast from 'react-hot-toast';
import { ledgerApi, stockApi } from '../api/stock';
import { useLedger } from '../context/StockLedger';
import type { ListStyle, StockCountChange, StockItemInput, StockSettings } from '../types/stock';

function errorMessage(err: any, fallback: string) {
  return err?.response?.data?.message || fallback;
}

/** The current stock book (main or manual - see context/StockLedger) and its API. */
export function useLedgerApi() {
  const ledger = useLedger();
  const api = useMemo(() => ledgerApi(ledger.base), [ledger.base]);
  return { ledger, api };
}

export function useStock() {
  const { ledger, api } = useLedgerApi();
  return useQuery({ queryKey: [ledger.key], ...persisted(ledger.key, api.get), refetchInterval: 60_000 });
}

export function useStockMessage(enabled = true) {
  const { ledger, api } = useLedgerApi();
  return useQuery({ queryKey: [ledger.key, 'message'], queryFn: api.message, enabled });
}

export function useStockMovements() {
  const { ledger, api } = useLedgerApi();
  return useQuery({ queryKey: [ledger.key, 'movements'], queryFn: () => api.movements(30) });
}

/** Any stock write invalidates that book's whole tree: sheet, message and history move together. */
function useStockMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  { success, failure }: { success?: string | ((r: TResult) => string); failure: string }
) {
  const queryClient = useQueryClient();
  const { key } = useLedger();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [key] });
      if (success) toast.success(typeof success === 'function' ? success(result) : success);
    },
    onError: (err) => toast.error(errorMessage(err, failure)),
  });
}

export function useSaveStockCount() {
  const { api } = useLedgerApi();
  return useStockMutation((changes: StockCountChange[]) => api.saveCount(changes), {
    success: (r) => `Stock saved - ${r.updated} line${r.updated === 1 ? '' : 's'} updated`,
    failure: 'Could not save the count',
  });
}

export function useStockOut() {
  const { api } = useLedgerApi();
  return useStockMutation(
    ({ id, body }: { id: string; body: { quantity: number; customer?: string; note?: string } }) =>
      api.stockOut(id, body),
    {
      success: ({ movement }) =>
        `Stock out recorded - ${Math.abs(movement.change)} ${movement.itemName}${movement.customer ? ` to ${movement.customer}` : ''}`,
      failure: 'Could not record the stock out',
    }
  );
}

/** Quiet save for the inline internal note - no toast on every blur. */
export function useSaveInternalNote() {
  const queryClient = useQueryClient();
  const { ledger, api } = useLedgerApi();
  return useMutation({
    mutationFn: ({ id, internalNote }: { id: string; internalNote: string }) => api.updateItem(id, { internalNote }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ledger.key] }),
    onError: (err) => toast.error(errorMessage(err, 'Could not save the note')),
  });
}

export function useCreateStockItem() {
  const { api } = useLedgerApi();
  return useStockMutation((body: StockItemInput) => api.createItem(body), {
    success: (item) => `${item.name} added`,
    failure: 'Could not add the item',
  });
}

export function useUpdateStockItem() {
  const { api } = useLedgerApi();
  return useStockMutation(({ id, body }: { id: string; body: StockItemInput }) => api.updateItem(id, body), {
    success: 'Item updated',
    failure: 'Could not update the item',
  });
}

export function useRemoveStockItem() {
  const { api } = useLedgerApi();
  return useStockMutation((id: string) => api.removeItem(id), {
    success: 'Item removed from stock',
    failure: 'Could not remove the item',
  });
}

export function useCreateStockCategory() {
  const { api } = useLedgerApi();
  return useStockMutation((body: { name: string; listStyle?: ListStyle }) => api.createCategory(body), {
    success: (c) => `Category "${c.name}" added`,
    failure: 'Could not add the category',
  });
}

export function useUpdateStockCategory() {
  const { api } = useLedgerApi();
  return useStockMutation(
    ({ id, body }: { id: string; body: { name?: string; listStyle?: ListStyle } }) => api.updateCategory(id, body),
    { failure: 'Could not update the category' }
  );
}

export function useDeleteStockCategory() {
  const { api } = useLedgerApi();
  return useStockMutation((id: string) => api.deleteCategory(id), {
    success: 'Category removed',
    failure: 'Could not remove the category',
  });
}

export function useUpdateStockSettings() {
  const { api } = useLedgerApi();
  return useStockMutation(
    (body: { hideZeroInMessage?: boolean; broadcast?: Partial<StockSettings['broadcast']> }) =>
      api.updateSettings(body),
    { success: 'Stock sharing settings saved', failure: 'Could not save the settings' }
  );
}

export function useSendStockNow() {
  return useStockMutation(() => stockApi.sendNow(), {
    success: (r) =>
      `Sent to ${r.sent} of ${r.total} number${r.total === 1 ? '' : 's'}${
        r.messagesPerRecipient > 1 ? ` (${r.messagesPerRecipient} messages each)` : ''
      }`,
    failure: 'Could not send the update',
  });
}

// ─────────────────────────── Zoho Books ───────────────────────────

export function useZohoStatus(enabled = true) {
  const queryClient = useQueryClient();
  const wasSyncing = useRef(false);
  const query = useQuery({
    queryKey: ['stock', 'zoho'],
    queryFn: stockApi.zoho.status,
    enabled,
    // Check often while a long sync runs, so the sheet updates as soon as it finishes.
    refetchInterval: (q) => (q.state.data?.syncing ? 5_000 : 60_000),
  });
  const syncing = !!query.data?.syncing;
  useEffect(() => {
    if (wasSyncing.current && !syncing) queryClient.invalidateQueries({ queryKey: ['stock'] });
    wasSyncing.current = syncing;
  }, [syncing, queryClient]);
  return query;
}

export function useConnectZoho() {
  return useMutation({
    mutationFn: stockApi.zoho.connect,
    // Off to Zoho's sign-in; it sends the browser back to /stock?zoho=...
    onSuccess: (url) => window.location.assign(url),
    onError: (err) => toast.error(errorMessage(err, 'Could not start the Zoho sign-in')),
  });
}

export function useUpdateZoho() {
  return useStockMutation((body: { organizationId?: string; autoCreate?: boolean }) => stockApi.zoho.update(body), {
    success: 'Zoho Books settings saved',
    failure: 'Could not save the Zoho settings',
  });
}

export function useSyncZoho() {
  return useStockMutation(() => stockApi.zoho.sync(), {
    success: ({ summary: s, running }) => {
      if (running || !s) return 'Syncing with Zoho Books - reading every item takes a few minutes; stock updates by itself when done';
      const parts = [
        s.stockIn && `${s.stockIn} in`,
        s.stockOut && `${s.stockOut} out`,
        s.created && `${s.created} new item${s.created === 1 ? '' : 's'}`,
        s.linked && `${s.linked} linked`,
      ].filter(Boolean);
      return parts.length ? `Synced with Zoho Books - ${parts.join(', ')}` : 'Synced with Zoho Books - already up to date';
    },
    failure: 'Could not sync with Zoho Books',
  });
}

export function useRotateZohoWebhook() {
  return useStockMutation(() => stockApi.zoho.rotateWebhook(), {
    success: 'New webhook URL created - update it in your Zoho workflow rules',
    failure: 'Could not replace the webhook URL',
  });
}

export function useDisconnectZoho() {
  return useStockMutation(() => stockApi.zoho.disconnect(), {
    success: 'Zoho Books disconnected - every line is manual again',
    failure: 'Could not disconnect Zoho Books',
  });
}

export function useRotateStockLink() {
  const { api } = useLedgerApi();
  return useStockMutation(() => api.rotateShareToken(), {
    success: 'New link created - the old one no longer works',
    failure: 'Could not replace the link',
  });
}
