import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import clsx from 'clsx';
import type { Shipment } from '../types/shipment';
import { StatusBadge } from './StatusBadge';
import { UrgencyBadge } from './UrgencyBadge';
import { ProgressRail } from './ProgressRail';
import { attentionReason, needsAttention } from '../utils/urgency';
import { deliverTo, deliveredOn, deliveryVerdict, formatINR, formatWeight } from '../utils/logistics';
import { useCarriers } from '../hooks/useCarriers';
import { CourierLogo } from './CourierPicker';

/**
 * One consignment at a glance: identity, what's in it, how far along it is, when it's
 * due. Colour is reserved for status and urgency, so a card that needs a human is the
 * only thing on screen that looks different.
 */
export function ShipmentCard({
  shipment,
  selected,
  onToggleSelect,
}: {
  shipment: Shipment;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const flagged = needsAttention(shipment);
  const to = deliverTo(shipment);
  const { byCode } = useCarriers();
  const qty = shipment.productDetails?.quantity;
  const deliveredAt = deliveredOn(shipment);
  const verdict = deliveryVerdict(shipment);

  return (
    <div
      className={clsx(
        'group relative rounded-xl border bg-white transition',
        selected
          ? 'border-brand-600 ring-1 ring-brand-600'
          : 'border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:shadow-[0_4px_16px_-6px_rgba(15,23,42,0.12)]'
      )}
    >
      <Link to={`/shipments/${shipment._id}`} className="block rounded-xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <div className="flex items-center justify-between gap-3 pl-7">
          <span className="font-mono text-[13px] font-semibold tabular-nums text-slate-900">
            {shipment.trackingNumber}
          </span>
          <StatusBadge status={shipment.status} variant="pill" className="shrink-0" />
        </div>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 pl-7 text-[12px] text-slate-500">
          <CourierLogo courier={byCode.get(shipment.carrierCode) ?? { name: shipment.carrierName, logo: '' }} size={14} />
          <span className="truncate">{shipment.carrierName}</span>
        </p>

        <p className="mt-3 truncate text-[15px] font-semibold text-slate-900">
          {shipment.productDetails?.name || 'Unnamed product'}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-slate-500">
          {shipment.customerInfo?.name || 'No customer set'}
          {qty ? ` · ${qty} unit${qty === 1 ? '' : 's'}` : ''}
        </p>

        <ProgressRail status={shipment.status} className="mt-4" />

        {flagged && shipment.status === 'exception' && (
          <p className="mt-2.5 line-clamp-2 text-[12px] leading-snug text-red-600">{attentionReason(shipment)}</p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-[12px]">
          <div className="min-w-0">
            <dt className="text-slate-400">Last seen</dt>
            <dd className="mt-0.5 truncate font-medium text-slate-700">
              {shipment.currentLocation || 'Awaiting first scan'}
            </dd>
          </div>
          <div className="min-w-0 text-right">
            {deliveredAt ? (
              <>
                <dt className="text-slate-400">Delivered</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-slate-700">{format(deliveredAt, 'd MMM')}</dd>
                {verdict && (
                  <dd className={clsx('mt-0.5', verdict.late ? 'text-red-600' : 'text-emerald-700')}>{verdict.label}</dd>
                )}
              </>
            ) : (
              <>
                <dt className="text-slate-400">Due</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-slate-700">
                  {shipment.estimatedDelivery ? format(new Date(shipment.estimatedDelivery), 'd MMM') : '—'}
                </dd>
                <UrgencyBadge shipment={shipment} className="mt-0.5" />
              </>
            )}
          </div>
          <div className="min-w-0">
            <dt className="text-slate-400">Deliver to</dt>
            <dd className="mt-0.5 truncate font-medium text-slate-700" title={[to.line, to.place].filter(Boolean).join(', ')}>
              {to.place || to.line || '—'}
              {to.source === 'courier' && <span className="font-normal text-slate-400"> · courier</span>}
            </dd>
          </div>
          <div className="min-w-0 text-right">
            <dt className="text-slate-400">Weight · Freight</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-slate-700">
              {formatWeight(shipment.weightKg)} · {formatINR(shipment.freightAmount)}
            </dd>
          </div>
        </dl>
      </Link>

      {/* Outside the link so ticking it never navigates. Always visible: a hover-only
          checkbox is undiscoverable on touch, where this view is the default. */}
      <label className="absolute left-4 top-4 flex h-5 items-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(shipment._id)}
          className="block h-4 w-4 cursor-pointer accent-brand-800"
          aria-label={`Select ${shipment.trackingNumber}`}
        />
      </label>
    </div>
  );
}
