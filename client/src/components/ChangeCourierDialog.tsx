import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FormField, Modal } from './Modal';
import { CourierPicker } from './CourierPicker';
import { CreditCostNote } from './TrackingCredits';
import { Spinner } from './ui/Loading';
import { shipmentsApi } from '../api/shipments';
import type { Shipment } from '../types/shipment';

/**
 * Fixes a courier or AWB picked by mistake when the shipment was added. Everything else
 * on the shipment (customer, product, address, notes) stays as it is.
 */
export function ChangeCourierDialog({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [carrierCode, setCarrierCode] = useState(shipment.carrierCode);
  const [trackingNumber, setTrackingNumber] = useState(shipment.trackingNumber);
  const changed = carrierCode !== shipment.carrierCode || trackingNumber.trim() !== shipment.trackingNumber;

  const save = useMutation({
    mutationFn: () => shipmentsApi.changeCourier(shipment._id, { carrierCode, trackingNumber: trackingNumber.trim() }),
    onSuccess: ({ shipment: updated, warning }) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipment', updated._id] });
      queryClient.invalidateQueries({ queryKey: ['tracking-credits'] });
      if (warning) toast.error(warning, { duration: 10000 });
      else toast.success(`Now tracking with ${updated.carrierName}`);
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Could not change the courier'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (changed) save.mutate();
  }

  return (
    <Modal
      title="Change courier or AWB"
      description="For a courier or tracking number picked by mistake. Customer, product and address details stay as they are."
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto min-w-0">{changed && <CreditCostNote />}</span>
          <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
            Cancel
          </button>
          <button
            type="submit"
            form="change-courier-form"
            disabled={!changed || !trackingNumber.trim() || save.isPending}
            aria-busy={save.isPending}
            className="btn-primary h-9 px-4 py-0 text-[13px]"
          >
            {save.isPending && <Spinner />}
            {save.isPending ? 'Saving…' : 'Save and track again'}
          </button>
        </>
      }
    >
      <form id="change-courier-form" onSubmit={submit} className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
          Now: <span className="font-semibold text-slate-900">{shipment.carrierName}</span> · <span className="tabular-nums">{shipment.trackingNumber}</span>
        </p>
        <FormField label="Courier" htmlFor="change-courier">
          <CourierPicker id="change-courier" value={carrierCode} onChange={setCarrierCode} trackingNumber={trackingNumber} />
        </FormField>
        <FormField label="Tracking number (AWB)" htmlFor="change-awb">
          <input
            id="change-awb"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            className="input font-mono"
            maxLength={60}
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>
        {changed && (
          <p className="text-[12px] leading-relaxed text-slate-500">
            The old courier's scans are cleared and the shipment is tracked again with the new details - its status comes
            from the new courier from now on.
          </p>
        )}
      </form>
    </Modal>
  );
}
