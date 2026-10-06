import { useState, type FormEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { useCreateShipment } from '../hooks/useShipments';
import { FormField, Modal } from './Modal';
import { AddressFields, EMPTY_ADDRESS } from './AddressFields';
import { CourierPicker } from './CourierPicker';
import { LabelScanner } from './LabelScanner';
import type { DeliveryAddress, LabelDraft, LabelField } from '../types/shipment';
import { Spinner } from './ui/Loading';

const toNumberOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

type FormState = {
  trackingNumber: string;
  productName: string;
  sku: string;
  quantity: string;
  category: string;
  weightKg: string;
  freight: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingDate: string;
  estimatedDelivery: string;
};

/** The form values a scanned label provides - only the ones it actually found. */
function draftToForm(d: LabelDraft): Partial<FormState> {
  const out: Partial<FormState> = {
    trackingNumber: d.trackingNumber,
    productName: d.productDetails.name,
    sku: d.productDetails.sku,
    quantity: d.productDetails.quantity ? String(d.productDetails.quantity) : '',
    weightKg: d.weightKg != null ? String(d.weightKg) : '',
    freight: d.freightAmount != null ? String(d.freightAmount) : '',
    customerName: d.customerInfo.name,
    customerEmail: d.customerInfo.email,
    customerPhone: d.customerInfo.phone,
    shippingDate: d.shippingDate,
    estimatedDelivery: d.estimatedDelivery,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as Partial<FormState>;
}

function countFilled(d: LabelDraft) {
  const a = d.deliveryAddress;
  return Object.keys(draftToForm(d)).length + (d.carrierCode ? 1 : 0) + [a.line, a.city, a.state, a.pincode].filter(Boolean).length;
}

const FORM_TO_LABEL: Partial<Record<keyof FormState, LabelField>> = {
  trackingNumber: 'trackingNumber',
  productName: 'productName',
  quantity: 'quantity',
  weightKg: 'weightKg',
  freight: 'freightAmount',
  customerName: 'customerName',
  customerEmail: 'customerEmail',
  customerPhone: 'customerPhone',
  shippingDate: 'shippingDate',
  estimatedDelivery: 'estimatedDelivery',
};

const DEFAULT_COURIER = 'shreemaruticourier';
const LAST_COURIER_KEY = 'th.lastCourier';

/** Most bookings repeat the courier of the last one - start there. */
function readLastCourier(): string {
  try {
    return localStorage.getItem(LAST_COURIER_KEY) || DEFAULT_COURIER;
  } catch {
    return DEFAULT_COURIER;
  }
}

export function AddShipmentDialog({ onClose, initialLabel }: { onClose: () => void; initialLabel?: File | null }) {
  const createShipment = useCreateShipment();

  const [form, setForm] = useState<FormState>({
    trackingNumber: '',
    productName: '',
    sku: '',
    quantity: '1',
    category: '',
    weightKg: '',
    freight: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    shippingDate: '',
    estimatedDelivery: '',
  });
  const [address, setAddress] = useState<DeliveryAddress>(EMPTY_ADDRESS);
  const [carrierCode, setCarrierCode] = useState(readLastCourier);
  // Fields the label reader filled but wasn't sure of; cleared as each one is edited.
  const [unsure, setUnsure] = useState<Set<LabelField>>(new Set());

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    const field = FORM_TO_LABEL[key];
    if (field && unsure.has(field)) setUnsure((prev) => new Set([...prev].filter((f) => f !== field)));
  }

  function applyDraft(d: LabelDraft) {
    setForm((prev) => ({ ...prev, ...draftToForm(d) }));
    if (d.carrierCode) setCarrierCode(d.carrierCode);
    const a = d.deliveryAddress;
    if (a.line || a.city || a.state || a.pincode) {
      setAddress((prev) => ({
        line: a.line || prev.line,
        city: a.city || prev.city,
        state: a.state || prev.state,
        pincode: a.pincode || prev.pincode,
      }));
    }
    setUnsure(new Set(d.uncertainFields));
  }

  /** Amber outline on a field the reader flagged. */
  const flag = (field: LabelField) => unsure.has(field) && 'ring-2 ring-amber-400 ring-offset-0 border-amber-400';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.trackingNumber) return;

    // On failure the hook already shows the reason; keep the dialog open with what was typed.
    const ok = await createShipment.mutateAsync({
      trackingNumber: form.trackingNumber.trim(),
      carrierCode,
      productDetails: {
        name: form.productName,
        sku: form.sku,
        quantity: Number(form.quantity) || 1,
        category: form.category,
      },
      customerInfo: {
        name: form.customerName,
        email: form.customerEmail,
        phone: form.customerPhone,
      },
      weightKg: toNumberOrNull(form.weightKg),
      freightAmount: toNumberOrNull(form.freight),
      deliveryAddress: address,
      shippingDate: form.shippingDate || undefined,
      estimatedDelivery: form.estimatedDelivery || undefined,
    }).then(
      () => true,
      () => false
    );
    if (!ok) return;
    try {
      localStorage.setItem(LAST_COURIER_KEY, carrierCode);
    } catch {
      // Storage blocked - the default courier is used next time instead.
    }
    onClose();
  }

  return (
    <Modal
      size="lg"
      title="Add shipment"
      description="Only the AWB and courier are needed. The courier fills in the route and scans once tracking starts."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
            Cancel
          </button>
          <button
            type="submit"
            form="add-shipment-form"
            disabled={createShipment.isPending} aria-busy={createShipment.isPending}
            className="btn-primary h-9 px-4 py-0 text-[13px]"
          >
            {createShipment.isPending && <Spinner />}
            {createShipment.isPending ? 'Adding…' : 'Add shipment'}
          </button>
        </>
      }
    >
      <form id="add-shipment-form" onSubmit={handleSubmit} className="space-y-6">
        <LabelScanner initialFile={initialLabel} onDraft={applyDraft} countFilled={countFilled} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Tracking number (AWB)" htmlFor="ship-awb">
            <input
              id="ship-awb"
              required
              value={form.trackingNumber}
              onChange={(e) => update('trackingNumber', e.target.value)}
              className={clsx('input font-mono', flag('trackingNumber'))}
              placeholder="e.g. 26043200316922"
            />
          </FormField>
          <FormField label="Courier" htmlFor="ship-courier">
            <div className={clsx('rounded-lg', flag('courier'))}>
              <CourierPicker
                id="ship-courier"
                value={carrierCode}
                onChange={(code) => {
                  setCarrierCode(code);
                  setUnsure((prev) => new Set([...prev].filter((f) => f !== 'courier')));
                }}
                trackingNumber={form.trackingNumber}
              />
            </div>
          </FormField>
        </div>

        <Section title="Product and charges">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Product name" htmlFor="ship-product" optional>
              <input id="ship-product" value={form.productName} onChange={(e) => update('productName', e.target.value)} className={clsx('input', flag('productName'))} />
            </FormField>
            <FormField label="Product code" htmlFor="ship-sku" optional hint="Links to a stock line to deduct it automatically">
              <input
                id="ship-sku"
                value={form.sku}
                onChange={(e) => update('sku', e.target.value)}
                className="input"
                placeholder="e.g. PAD-HS1"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FormField label="Quantity" htmlFor="ship-qty">
              <input id="ship-qty" type="number" min={1} value={form.quantity} onChange={(e) => update('quantity', e.target.value)} className={clsx('input', flag('quantity'))} />
            </FormField>
            <FormField label="Category" htmlFor="ship-category" optional>
              <input id="ship-category" value={form.category} onChange={(e) => update('category', e.target.value)} className="input" placeholder="PPE…" />
            </FormField>
            <FormField label="Weight" htmlFor="ship-weight" optional>
              <Affixed suffix="kg">
                <input
                  id="ship-weight"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={form.weightKg}
                  onChange={(e) => update('weightKg', e.target.value)}
                  className={clsx('input pr-9', flag('weightKg'))}
                />
              </Affixed>
            </FormField>
            <FormField label="Freight" htmlFor="ship-freight" optional>
              <Affixed prefix="₹">
                <input
                  id="ship-freight"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={form.freight}
                  onChange={(e) => update('freight', e.target.value)}
                  className={clsx('input pl-7', flag('freightAmount'))}
                />
              </Affixed>
            </FormField>
          </div>
        </Section>

        <Section title="Customer">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Name" htmlFor="ship-cust-name" optional>
              <input id="ship-cust-name" value={form.customerName} onChange={(e) => update('customerName', e.target.value)} className={clsx('input', flag('customerName'))} />
            </FormField>
            <FormField label="Email" htmlFor="ship-cust-email" optional>
              <input
                id="ship-cust-email"
                type="email"
                value={form.customerEmail}
                onChange={(e) => update('customerEmail', e.target.value)}
                className={clsx('input', flag('customerEmail'))}
              />
            </FormField>
            <FormField label="Phone" htmlFor="ship-cust-phone" optional>
              <input id="ship-cust-phone" type="tel" value={form.customerPhone} onChange={(e) => update('customerPhone', e.target.value)} className={clsx('input', flag('customerPhone'))} />
            </FormField>
          </div>
        </Section>

        <Section
          title="Delivery address"
          hint={
            unsure.has('address') || unsure.has('pincode')
              ? unsure.has('address') && unsure.has('pincode')
                ? 'The address and pincode were hard to read on the label - check them.'
                : `The ${unsure.has('pincode') ? 'pincode' : 'address'} was hard to read on the label - check it.`
              : 'If you leave this empty, the courier’s destination city is shown instead.'
          }
          warn={unsure.has('address') || unsure.has('pincode')}
        >
          <AddressFields
            value={address}
            onChange={(next) => {
              // The pincode lookup also calls this (city/state only) - that isn't the person checking.
              const touched = new Set<LabelField>();
              if (next.line !== address.line) touched.add('address');
              if (next.pincode !== address.pincode) touched.add('pincode');
              setAddress(next);
              if (touched.size) setUnsure((prev) => new Set([...prev].filter((f) => !touched.has(f))));
            }}
            idPrefix="ship-addr"
          />
        </Section>

        <Section title="Dates">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Shipping date" htmlFor="ship-date" optional hint="Filled from the courier’s pickup scan if empty">
              <input id="ship-date" type="date" value={form.shippingDate} onChange={(e) => update('shippingDate', e.target.value)} className={clsx('input', flag('shippingDate'))} />
            </FormField>
            <FormField label="Promised delivery" htmlFor="ship-eta" optional>
              <input id="ship-eta" type="date" value={form.estimatedDelivery} onChange={(e) => update('estimatedDelivery', e.target.value)} className={clsx('input', flag('estimatedDelivery'))} />
            </FormField>
          </div>
        </Section>
      </form>
    </Modal>
  );
}

function Section({ title, hint, warn, children }: { title: string; hint?: string; warn?: boolean; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-slate-100 pt-5">
      <legend className="sr-only">{title}</legend>
      <div>
        <p className="text-[13px] font-semibold text-slate-900">{title}</p>
        {hint && <p className={clsx('mt-0.5 text-[12px]', warn ? 'font-medium text-amber-700' : 'text-slate-500')}>{hint}</p>}
      </div>
      {children}
    </fieldset>
  );
}

/** Puts a unit inside the input: "₹ [   ]" or "[   ] kg". */
export function Affixed({ prefix, suffix, children }: { prefix?: string; suffix?: string; children: ReactNode }) {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">{prefix}</span>
      )}
      {children}
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">{suffix}</span>
      )}
    </div>
  );
}
