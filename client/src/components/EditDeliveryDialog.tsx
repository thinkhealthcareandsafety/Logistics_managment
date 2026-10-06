import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { FormField, Modal } from './Modal';
import { AddressFields, EMPTY_ADDRESS } from './AddressFields';
import { Affixed } from './AddShipmentDialog';
import { useUpdateShipment } from '../hooks/useShipments';
import type { DeliveryAddress, Shipment } from '../types/shipment';
import { Spinner } from './ui/Loading';

const toNumberOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

/** Weight, freight and the client's delivery address - all optional, all editable later. */
export function EditDeliveryDialog({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const update = useUpdateShipment();
  const [weight, setWeight] = useState(shipment.weightKg != null ? String(shipment.weightKg) : '');
  const [freight, setFreight] = useState(shipment.freightAmount != null ? String(shipment.freightAmount) : '');
  const [address, setAddress] = useState<DeliveryAddress>({
    ...EMPTY_ADDRESS,
    ...shipment.deliveryAddress,
    // Older shipments kept a free-text address on the customer - carry it over.
    line: shipment.deliveryAddress?.line || shipment.customerInfo?.address || '',
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id: shipment._id,
        data: {
          weightKg: toNumberOrNull(weight),
          freightAmount: toNumberOrNull(freight),
          deliveryAddress: address,
        },
      });
      toast.success('Delivery details saved');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save the delivery details');
    }
  }

  return (
    <Modal
      size="lg"
      title="Delivery and charges"
      description={`${shipment.trackingNumber}${shipment.customerInfo?.name ? ` · ${shipment.customerInfo.name}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
            Cancel
          </button>
          <button type="submit" form="edit-delivery-form" disabled={update.isPending} aria-busy={update.isPending} className="btn-primary h-9 px-4 py-0 text-[13px]">
            {update.isPending && <Spinner />}
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="edit-delivery-form" onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <FormField label="Weight" htmlFor="edit-weight" optional>
            <Affixed suffix="kg">
              <input
                id="edit-weight"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="input pr-9"
              />
            </Affixed>
          </FormField>
          <FormField label="Freight" htmlFor="edit-freight" optional>
            <Affixed prefix="₹">
              <input
                id="edit-freight"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
                className="input pl-7"
              />
            </Affixed>
          </FormField>
        </div>
        <div className="border-t border-slate-100 pt-5">
          <p className="mb-3 text-[13px] font-semibold text-slate-900">Client delivery address</p>
          <AddressFields value={address} onChange={setAddress} idPrefix="edit-addr" />
        </div>
      </form>
    </Modal>
  );
}
