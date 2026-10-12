import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { FormField, Modal } from './Modal';
import { Spinner } from './ui/Loading';
import { shipmentsApi } from '../api/shipments';
import { ALL_STATUSES, STATUS_LABELS } from '../utils/status';
import type { Shipment, ShipmentStatus } from '../types/shipment';

/**
 * For when the courier's own website is ahead of TrackingMore's feed (it sometimes
 * misses a scan): set the status by hand. The next real scan replaces it.
 */
export function ManualStatusDialog({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ShipmentStatus>(shipment.status === 'delivered' ? 'delivered' : 'delivered');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [at, setAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await shipmentsApi.setStatus(shipment._id, { status, location, note, at: new Date(at).toISOString() });
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipment', shipment._id] });
      toast.success(`Marked ${STATUS_LABELS[status].toLowerCase()}`);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not update the status');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Update status by hand"
      description="Use this when the courier’s website shows a newer status than this app. The next real scan from the courier replaces it."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
            Cancel
          </button>
          <button type="submit" form="manual-status-form" disabled={saving} aria-busy={saving} className="btn-primary h-9 px-4 py-0 text-[13px]">
            {saving && <Spinner />}
            {saving ? 'Saving…' : 'Save status'}
          </button>
        </>
      }
    >
      <form id="manual-status-form" onSubmit={submit} className="space-y-4">
        <FormField label="Status" htmlFor="manual-status">
          <select id="manual-status" value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus)} className="input">
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="When" htmlFor="manual-at">
            <input id="manual-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="input" />
          </FormField>
          <FormField label="Location" htmlFor="manual-location" optional>
            <input id="manual-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Goa - Margao" className="input" />
          </FormField>
        </div>
        <FormField label="Note" htmlFor="manual-note" optional>
          <input id="manual-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Delivered as per shreemaruti.com" className="input" />
        </FormField>
      </form>
    </Modal>
  );
}
