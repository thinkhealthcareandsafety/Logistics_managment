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

  // Customer and product - often skipped when a shipment is added in a hurry.
  const [customer, setCustomer] = useState({
    name: shipment.customerInfo?.name ?? '',
    phone: shipment.customerInfo?.phone ?? '',
    email: shipment.customerInfo?.email ?? '',
  });
  const [product, setProduct] = useState({
    name: shipment.productDetails?.name ?? '',
    sku: shipment.productDetails?.sku ?? '',
    quantity: String(shipment.productDetails?.quantity ?? 1),
    category: shipment.productDetails?.category ?? '',
  });

  const toDay = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : '');
  const delivered = shipment.status === 'delivered';
  const [dates, setDates] = useState({ shipped: toDay(shipment.shippingDate), delivered: toDay(shipment.deliveredAt) });
  const b = shipment.booking;
  const [booking, setBooking] = useState({
    invoiceNumber: b?.invoiceNumber ?? '',
    shipmentValue: b?.shipmentValue != null ? String(b.shipmentValue) : '',
    boxes: b?.boxes != null ? String(b.boxes) : '',
    paymentType: b?.paymentType ?? '',
    notes: b?.notes ?? '',
  });
  // A date typed as YYYY-MM-DD is that day at noon India time - never the day before in UTC.
  const atNoon = (d: string) => (d ? `${d}T12:00:00+05:30` : null);
  const [ewb, setEwb] = useState({
    number: shipment.ewayBill?.number ?? '',
    generatedAt: toDay(shipment.ewayBill?.generatedAt),
    validUntil: toDay(shipment.ewayBill?.validUntil),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id: shipment._id,
        data: {
          customerInfo: { ...shipment.customerInfo, name: customer.name.trim(), phone: customer.phone.trim(), email: customer.email.trim() },
          productDetails: {
            ...shipment.productDetails,
            name: product.name.trim(),
            sku: product.sku.trim(),
            quantity: Math.max(1, Number.parseInt(product.quantity, 10) || 1),
            category: product.category.trim(),
          },
          weightKg: toNumberOrNull(weight),
          freightAmount: toNumberOrNull(freight),
          deliveryAddress: address,
          ewayBill: { number: ewb.number.replace(/\s+/g, ''), generatedAt: ewb.generatedAt || null, validUntil: ewb.validUntil || null },
          ...(dates.shipped && dates.shipped !== toDay(shipment.shippingDate) ? { shippingDate: atNoon(dates.shipped) ?? undefined } : {}),
          ...(delivered && dates.delivered !== toDay(shipment.deliveredAt) ? { deliveredAt: atNoon(dates.delivered) } : {}),
          booking: {
            invoiceNumber: booking.invoiceNumber.trim(),
            shipmentValue: toNumberOrNull(booking.shipmentValue),
            boxes: toNumberOrNull(booking.boxes),
            paymentType: booking.paymentType.trim(),
            notes: booking.notes.trim(),
          },
        },
      });
      toast.success('Shipment saved');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save the shipment');
    }
  }

  return (
    <Modal
      size="lg"
      title="Edit shipment"
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
        <fieldset className="space-y-3">
          <legend className="text-[13px] font-semibold text-slate-900">Customer</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Name" htmlFor="edit-cust-name" optional>
              <input id="edit-cust-name" value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} className="input" />
            </FormField>
            <FormField label="Phone" htmlFor="edit-cust-phone" optional>
              <input id="edit-cust-phone" type="tel" value={customer.phone} onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))} className="input" />
            </FormField>
            <FormField label="Email" htmlFor="edit-cust-email" optional>
              <input id="edit-cust-email" type="email" value={customer.email} onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))} className="input" />
            </FormField>
          </div>
        </fieldset>
        <fieldset className="space-y-3 border-t border-slate-100 pt-5">
          <legend className="text-[13px] font-semibold text-slate-900">Product</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Product name" htmlFor="edit-prod-name" optional>
              <input id="edit-prod-name" value={product.name} onChange={(e) => setProduct((p) => ({ ...p, name: e.target.value }))} className="input" />
            </FormField>
            <FormField label="Product code" htmlFor="edit-prod-sku" optional hint="Links to a stock line">
              <input id="edit-prod-sku" value={product.sku} onChange={(e) => setProduct((p) => ({ ...p, sku: e.target.value }))} className="input" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Quantity" htmlFor="edit-prod-qty">
              <input id="edit-prod-qty" type="number" min={1} value={product.quantity} onChange={(e) => setProduct((p) => ({ ...p, quantity: e.target.value }))} className="input" />
            </FormField>
            <FormField label="Category" htmlFor="edit-prod-cat" optional>
              <input id="edit-prod-cat" value={product.category} onChange={(e) => setProduct((p) => ({ ...p, category: e.target.value }))} className="input" />
            </FormField>
          </div>
        </fieldset>
        <fieldset className="space-y-3 border-t border-slate-100 pt-5">
          <legend className="text-[13px] font-semibold text-slate-900">Order</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Invoice no." htmlFor="edit-inv" optional>
              <input id="edit-inv" value={booking.invoiceNumber} onChange={(e) => setBooking((x) => ({ ...x, invoiceNumber: e.target.value }))} className="input" />
            </FormField>
            <FormField label="Shipment value" htmlFor="edit-value" optional>
              <Affixed prefix="₹">
                <input
                  id="edit-value"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={booking.shipmentValue}
                  onChange={(e) => setBooking((x) => ({ ...x, shipmentValue: e.target.value }))}
                  className="input pl-7"
                />
              </Affixed>
            </FormField>
            <FormField label="Boxes" htmlFor="edit-boxes" optional>
              <input id="edit-boxes" type="number" min={0} value={booking.boxes} onChange={(e) => setBooking((x) => ({ ...x, boxes: e.target.value }))} className="input" />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Shipped on" htmlFor="edit-shipped" optional>
              <input id="edit-shipped" type="date" value={dates.shipped} onChange={(e) => setDates((x) => ({ ...x, shipped: e.target.value }))} className="input" />
            </FormField>
            {delivered && (
              <FormField label="Delivered on" htmlFor="edit-delivered" optional>
                <input id="edit-delivered" type="date" value={dates.delivered} onChange={(e) => setDates((x) => ({ ...x, delivered: e.target.value }))} className="input" />
              </FormField>
            )}
            <FormField label="Freight paid by" htmlFor="edit-paytype" optional>
              <input id="edit-paytype" value={booking.paymentType} onChange={(e) => setBooking((x) => ({ ...x, paymentType: e.target.value }))} className="input" />
            </FormField>
          </div>
          <FormField label="Notes" htmlFor="edit-notes" optional>
            <input id="edit-notes" value={booking.notes} onChange={(e) => setBooking((x) => ({ ...x, notes: e.target.value }))} className="input" />
          </FormField>
        </fieldset>
        <div className="border-t border-slate-100 pt-5" />
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
        <fieldset className="space-y-3 border-t border-slate-100 pt-5">
          <legend className="text-[13px] font-semibold text-slate-900">E-way bill</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="E-way bill no." htmlFor="ewb-number" optional>
              <input
                id="ewb-number"
                inputMode="numeric"
                maxLength={14}
                pattern="\d{4}\s?\d{4}\s?\d{4}|\d{12}"
                title="12 digits"
                value={ewb.number}
                onChange={(ev) => setEwb((x) => ({ ...x, number: ev.target.value }))}
                placeholder="12 digits"
                className="input font-mono"
              />
            </FormField>
            <FormField label="Generated on" htmlFor="ewb-date" optional>
              <input id="ewb-date" type="date" value={ewb.generatedAt} onChange={(ev) => setEwb((x) => ({ ...x, generatedAt: ev.target.value }))} className="input" />
            </FormField>
            <FormField label="Valid until" htmlFor="ewb-valid" optional>
              <input id="ewb-valid" type="date" value={ewb.validUntil} onChange={(ev) => setEwb((x) => ({ ...x, validUntil: ev.target.value }))} className="input" />
            </FormField>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
