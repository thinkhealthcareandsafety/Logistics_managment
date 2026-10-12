import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNowStrict } from 'date-fns';
import clsx from 'clsx';
import type { Shipment } from '../types/shipment';
import { StatusBadge } from './StatusBadge';
import { UrgencyBadge } from './UrgencyBadge';
import { attentionReason, needsAttention } from '../utils/urgency';
import { deliverTo, deliveredOn, deliveryVerdict, destinationMismatch, ewayBillMissing, formatINR, formatWeight } from '../utils/logistics';
import { EditDeliveryDialog } from './EditDeliveryDialog';
import { useCarriers } from '../hooks/useCarriers';
import { CourierLogo } from './CourierPicker';

/**
 * Two-line cells (identifier over context) keep the column count at five, so nothing
 * truncates at laptop widths. Attention is carried by a reason line under the status,
 * not a coloured rail - the reason is what someone actually needs to read.
 */
export function ShipmentTable({
  shipments,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: {
  shipments: Shipment[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}) {
  const navigate = useNavigate();
  const { byCode } = useCarriers();
  const [editing, setEditing] = useState<Shipment | null>(null);
  const allSelected = shipments.length > 0 && shipments.every((s) => selectedIds.has(s._id));
  const someSelected = shipments.some((s) => selectedIds.has(s._id)) && !allSelected;

  return (
    <>
    {editing && <EditDeliveryDialog shipment={editing} onClose={() => setEditing(null)} />}
    <table className="w-full table-fixed border-collapse text-left">
      {/* table-fixed takes column widths from this header row; hidden cells drop out of it. */}
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50/70 text-[12px] font-medium text-slate-500">
          <th scope="col" className="w-11 py-2.5 pl-4">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={onToggleSelectAll}
              label="Select all shipments"
            />
          </th>
          <th scope="col" className="py-2.5 pr-4 font-medium">Shipment</th>
          <th scope="col" className="hidden w-[16%] py-2.5 pr-4 font-medium lg:table-cell">Customer</th>
          <th scope="col" className="hidden w-[17%] py-2.5 pr-4 font-medium lg:table-cell">Deliver to</th>
          <th scope="col" className="w-[34%] py-2.5 pr-4 font-medium sm:w-[24%] lg:w-[15%]">Status</th>
          <th scope="col" className="hidden w-[18%] py-2.5 pr-4 font-medium sm:table-cell lg:w-[12%]">Delivery</th>
          <th scope="col" className="hidden w-[13%] py-2.5 pr-4 text-right font-medium md:table-cell lg:w-[10%]">
            Weight · Freight
          </th>
          <th scope="col" className="hidden w-[9%] py-2.5 pr-4 text-right font-medium 2xl:table-cell">Updated</th>
          <th scope="col" className="w-[4.5rem] py-2.5" aria-label="Edit or open" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {shipments.map((shipment) => {
          const selected = selectedIds.has(shipment._id);
          const flagged = needsAttention(shipment);
          const href = `/shipments/${shipment._id}`;
          const qty = shipment.productDetails?.quantity;

          return (
            <tr
              key={shipment._id}
              onClick={() => navigate(href)}
              className={clsx(
                'group cursor-pointer align-top text-[13px] transition-colors',
                selected ? 'bg-brand-50/60' : 'hover:bg-slate-50/80'
              )}
            >
              <td className="py-3.5 pl-4" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selected}
                  onChange={() => onToggleSelect(shipment._id)}
                  label={`Select ${shipment.trackingNumber}`}
                />
              </td>

              <td className="min-w-0 py-3 pr-4">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    to={href}
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono text-[13px] font-semibold tabular-nums text-slate-900 outline-none hover:text-brand-800 focus-visible:underline"
                  >
                    {shipment.trackingNumber}
                  </Link>
                  <span
                    className="inline-flex min-w-0 items-center gap-1 text-[12px] text-slate-500"
                    title={shipment.carrierName}
                  >
                    <CourierLogo courier={byCode.get(shipment.carrierCode) ?? { name: shipment.carrierName, logo: '' }} size={14} />
                    <span className="truncate">{shipment.carrierName}</span>
                  </span>
                </div>
                <p className="mt-0.5 truncate text-slate-500">
                  {shipment.productDetails?.name || 'Unnamed product'}
                  {qty ? <span className="text-slate-400"> · {qty} unit{qty === 1 ? '' : 's'}</span> : null}
                </p>
                <p className="mt-0.5 text-[12px]">
                  {shipment.ewayBill?.number ? (
                    <span className="font-mono tabular-nums text-slate-600">
                      <span className="font-sans text-slate-400">E-way bill </span>
                      {shipment.ewayBill.number.replace(/(\d{4})(?=\d)/g, '$1 ')}
                    </span>
                  ) : ewayBillMissing(shipment) ? (
                    <span className="font-medium text-amber-700" title="Worth ₹50,000 or more - an e-way bill is required">E-way bill needed</span>
                  ) : (
                    <span className="text-slate-400">No e-way bill</span>
                  )}
                </p>
              </td>

              <td className="hidden min-w-0 py-3 pr-4 lg:table-cell">
                <p className="truncate font-medium text-slate-800">{shipment.customerInfo?.name || '—'}</p>
                <p className="mt-0.5 truncate text-slate-500" title="Last scan">
                  {shipment.currentLocation || (shipment.status === 'delivered' ? 'No courier scans' : 'Awaiting first scan')}
                </p>
              </td>

              <td className="hidden min-w-0 py-3 pr-4 lg:table-cell">
                <DeliverToCell shipment={shipment} />
              </td>

              <td className="min-w-0 py-3 pr-4">
                <StatusBadge status={shipment.status} variant="pill" />
                {flagged && shipment.status === 'exception' && (
                  <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-red-600">
                    {attentionReason(shipment)}
                  </p>
                )}
              </td>

              <td className="hidden py-3 pr-4 sm:table-cell">
                <DeliveryCell shipment={shipment} />
              </td>

              <td className="hidden py-3 pr-4 text-right tabular-nums md:table-cell">
                <p className={shipment.weightKg == null ? 'text-slate-300' : 'text-slate-800'}>{formatWeight(shipment.weightKg)}</p>
                <p className={clsx('mt-0.5', shipment.freightAmount == null ? 'text-slate-300' : 'text-slate-500')}>
                  {formatINR(shipment.freightAmount)}
                </p>
              </td>

              <td className="hidden whitespace-nowrap py-3.5 pr-4 text-right tabular-nums text-slate-400 2xl:table-cell">
                {shipment.lastCheckedAt
                  ? formatDistanceToNowStrict(new Date(shipment.lastCheckedAt), { addSuffix: true })
                  : '—'}
              </td>

              <td className="py-2.5 pr-3">
                <div className="flex items-center justify-end gap-1 text-slate-300 transition-colors group-hover:text-slate-500">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(shipment);
                    }}
                    aria-label={`Edit ${shipment.trackingNumber}`}
                    title="Edit customer, product and order details"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-brand-700 hover:ring-1 hover:ring-slate-200"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </>
  );
}

/** Entered address first; otherwise the courier's destination, labelled as such. */
/** Delivered: the day it arrived (and how that compares to the promise). Otherwise: the ETA. */
function DeliveryCell({ shipment }: { shipment: Shipment }) {
  const on = deliveredOn(shipment);
  if (on) {
    const verdict = deliveryVerdict(shipment);
    return (
      <>
        <p className="tabular-nums text-slate-800" title={format(on, 'd MMM yyyy, h:mm a')}>
          {format(on, 'd MMM yyyy')}
        </p>
        <p className={clsx('mt-0.5 text-[12px]', verdict?.late ? 'text-red-600' : 'text-emerald-700')}>
          Delivered{verdict ? ` · ${verdict.label}` : ''}
        </p>
      </>
    );
  }
  return (
    <>
      <p className="tabular-nums text-slate-800">
        {shipment.estimatedDelivery ? format(new Date(shipment.estimatedDelivery), 'd MMM yyyy') : '—'}
      </p>
      {shipment.estimatedDelivery && <p className="mt-0.5 text-[12px] text-slate-400">Expected</p>}
      <UrgencyBadge shipment={shipment} className="mt-0.5" />
    </>
  );
}

function DeliverToCell({ shipment }: { shipment: Shipment }) {
  const to = deliverTo(shipment);
  const mismatch = destinationMismatch(shipment);
  if (!to.source) return <p className="text-slate-300">—</p>;
  return (
    <>
      <p className="truncate font-medium text-slate-800" title={[to.line, to.place].filter(Boolean).join(', ')}>
        {to.place || to.line}
      </p>
      <p className={clsx('mt-0.5 truncate', mismatch ? 'text-amber-700' : 'text-slate-500')} title={mismatch ?? undefined}>
        {mismatch ? 'Courier destination differs' : to.source === 'courier' ? 'From courier' : to.line && to.place ? to.line : ''}
      </p>
    </>
  );
}

function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={onChange}
      className="block h-4 w-4 cursor-pointer accent-brand-800"
      aria-label={label}
    />
  );
}
