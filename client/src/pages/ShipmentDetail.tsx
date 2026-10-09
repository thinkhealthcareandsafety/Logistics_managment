import { useState, type ReactNode } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useShipment, useRefreshShipment, useUpdateShipment, useDeleteShipment } from '../hooks/useShipments';
import { StatusBadge } from '../components/StatusBadge';
import { UrgencyBadge } from '../components/UrgencyBadge';
import { ProgressRail } from '../components/ProgressRail';
import { Timeline } from '../components/Timeline';
import { ExceptionPanel } from '../components/ExceptionPanel';
import { CustomerFeedbackPanel } from '../components/CustomerFeedbackPanel';
import { Menu, MenuDivider, MenuItem } from '../components/Menu';
import { EditDeliveryDialog } from '../components/EditDeliveryDialog';
import { CourierLogo } from '../components/CourierPicker';
import { useCarriers } from '../hooks/useCarriers';
import { Spinner } from '../components/ui/Loading';
import { daysLate, getUrgency } from '../utils/urgency';
import {
  deliverTo,
  deliveredOn,
  deliveryVerdict,
  destinationMismatch,
  formatDuration,
  formatINR,
  formatWeight,
  processingTime,
} from '../utils/logistics';
import type { Shipment } from '../types/shipment';

import { DetailSkeleton } from '../components/skeletons/PageSkeletons';
export function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: shipment, isLoading } = useShipment(id);
  const refresh = useRefreshShipment();
  const update = useUpdateShipment();
  const del = useDeleteShipment();
  const [editingDelivery, setEditingDelivery] = useState(false);

  if (isLoading) return <DetailSkeleton />;
  if (!shipment) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm font-semibold text-slate-900">Shipment not found</p>
        <p className="mt-1 text-[13px] text-slate-500">It may have been deleted, or the link is wrong.</p>
        <Link to="/dashboard" className="btn-secondary mt-5 inline-block">
          Back to shipments
        </Link>
      </div>
    );
  }

  const s = shipment;
  const late = getUrgency(s) === 'late' && s.status !== 'exception';
  const customer = s.customerInfo || ({} as typeof s.customerInfo);
  const qty = s.productDetails?.quantity;
  const deliveredAt = deliveredOn(s);
  const verdict = deliveryVerdict(s);

  function copyLink(kind: 'track' | 'feedback') {
    const url = `${window.location.origin}/${kind}/${encodeURIComponent(s.trackingNumber)}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success(kind === 'track' ? 'Tracking link copied' : 'Feedback link copied'),
      () => toast.error('Could not copy link')
    );
  }

  function toggleArchive() {
    update.mutate(
      { id: s._id, data: { isArchived: !s.isArchived } },
      { onSuccess: () => toast.success(s.isArchived ? 'Moved back to active shipments' : 'Shipment archived') }
    );
  }

  function remove() {
    if (!confirm(`Delete ${s.trackingNumber} permanently? Its tracking history will be lost.`)) return;
    // Leave the page on success - staying would show a record that no longer exists.
    del.mutate(s._id, { onSuccess: () => navigate('/dashboard', { replace: true }) });
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-slate-500">
        <Link to="/dashboard" className="rounded transition hover:text-slate-900">
          Shipments
        </Link>
        <span aria-hidden className="text-slate-300">/</span>
        <span className="font-mono text-slate-700">{s.trackingNumber}</span>
      </nav>

      {/* ───────── Header ───────── */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-mono text-[22px] font-semibold tracking-[-0.01em] text-slate-950">{s.trackingNumber}</h1>
              <StatusBadge status={s.status} variant="pill" />
              {s.isArchived && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Archived</span>
              )}
            </div>
            <p className="mt-1.5 text-[14px] text-slate-600">
              {s.productDetails?.name || 'Unnamed product'}
              {qty ? <span className="text-slate-400"> · {qty} unit{qty === 1 ? '' : 's'}</span> : null}
              {customer.name && (
                <>
                  <span className="text-slate-400"> for </span>
                  {customer.name}
                </>
              )}
            </p>
            <CourierLine shipment={s} />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button className={actionButton} onClick={() => copyLink('track')}>
              <LinkIcon />
              Copy tracking link
            </button>
            {/* Archive/delete run from the menu, which closes at once - say they're happening. */}
            {(del.isPending || update.isPending) && (
              <span className="inline-flex items-center gap-1.5 px-1 text-[13px] text-slate-500" role="status">
                <Spinner className="h-3.5 w-3.5" />
                {del.isPending ? 'Deleting…' : s.isArchived ? 'Restoring…' : 'Saving…'}
              </span>
            )}
            <button className={actionButton} onClick={() => refresh.mutate(s._id)} disabled={refresh.isPending} aria-busy={refresh.isPending}>
              <RefreshIcon spinning={refresh.isPending} />
              <span className="hidden sm:inline">{refresh.isPending ? 'Refreshing…' : 'Refresh'}</span>
            </button>
            <Menu
              label="More actions"
              triggerClassName={clsx(actionButton, 'w-9 justify-center px-0')}
              trigger={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              }
            >
              {s.status === 'delivered' && (
                <MenuItem onSelect={() => copyLink('feedback')} icon={<LinkIcon />}>
                  Copy feedback link
                </MenuItem>
              )}
              <MenuItem onSelect={() => window.open(`/track/${encodeURIComponent(s.trackingNumber)}`, '_blank')} icon={<ExternalIcon />}>
                Open customer tracking page
              </MenuItem>
              <MenuItem onSelect={toggleArchive} icon={<ArchiveIcon />}>
                {s.isArchived ? 'Move back to active' : 'Archive'}
              </MenuItem>
              <MenuDivider />
              <MenuItem onSelect={remove} tone="danger" icon={<TrashIcon />}>
                Delete shipment
              </MenuItem>
            </Menu>
          </div>
        </div>

        <div className="border-t border-slate-100 px-5 pb-5 pt-5 sm:px-6">
          <ProgressRail status={s.status} showLabels />
        </div>

        <ProcessingBand shipment={s} />

        <dl className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 lg:grid-cols-4">
          <Fact label="Last seen" value={s.currentLocation || 'Awaiting first scan'} />
          <Fact label="Shipped" value={s.shippingDate ? format(new Date(s.shippingDate), 'd MMM yyyy') : '—'} />
          {deliveredAt ? (
            <Fact
              label="Delivered"
              value={format(deliveredAt, 'd MMM yyyy')}
              title={format(deliveredAt, 'd MMM yyyy · h:mm a')}
              extra={
                <span className={clsx('text-[12px]', verdict?.late ? 'text-red-600' : 'text-slate-500')}>
                  {s.estimatedDelivery
                    ? `Promised ${format(new Date(s.estimatedDelivery), 'd MMM')} · ${verdict?.label ?? ''}`
                    : format(deliveredAt, 'h:mm a')}
                </span>
              }
            />
          ) : (
            <Fact
              label="Promised delivery"
              value={s.estimatedDelivery ? format(new Date(s.estimatedDelivery), 'd MMM yyyy') : 'Not set'}
              extra={<UrgencyBadge shipment={s} />}
            />
          )}
          <Fact
            label="Last checked"
            value={s.lastCheckedAt ? formatDistanceToNow(new Date(s.lastCheckedAt), { addSuffix: true }) : 'Never'}
            title={s.lastCheckedAt ? format(new Date(s.lastCheckedAt), 'd MMM yyyy · h:mm a') : undefined}
          />
        </dl>
      </section>

      {/* A late shipment is the one situation where ops has to act - say so, and put
          the ways to act right there. */}
      {late && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <svg className="mt-0.5 shrink-0 text-amber-600" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <p className="text-[14px] font-semibold text-amber-900">
                {daysLate(s)} day{daysLate(s) === 1 ? '' : 's'} past the promised delivery date
              </p>
              <p className="mt-0.5 text-[13px] text-amber-800/80">
                Chase {s.carrierName || 'the courier'} for an update, and let {customer.name || 'the customer'} know before
                they have to ask.
              </p>
            </div>
          </div>
          {(customer.email || customer.phone) && (
            <div className="flex shrink-0 gap-2 pl-8 sm:pl-0">
              {customer.email && (
                <a
                  href={`mailto:${customer.email}?subject=${encodeURIComponent(`Update on your delivery ${s.trackingNumber}`)}`}
                  className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-[13px] font-medium text-amber-900 ring-1 ring-inset ring-amber-300 transition hover:bg-amber-100"
                >
                  Email customer
                </a>
              )}
              {customer.phone && (
                <a
                  href={`tel:${customer.phone.replace(/\s+/g, '')}`}
                  className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-[13px] font-medium text-amber-900 ring-1 ring-inset ring-amber-300 transition hover:bg-amber-100"
                >
                  Call
                </a>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {s.status === 'exception' && <ExceptionPanel shipment={s} />}
          {s.status === 'delivered' && <CustomerFeedbackPanel shipment={s} />}

          <Card title="Tracking history" aside={`${s.checkpoints.length} scan${s.checkpoints.length === 1 ? '' : 's'}`}>
            <Timeline checkpoints={s.checkpoints} />
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <DeliveryCard shipment={s} onEdit={() => setEditingDelivery(true)} />

          <Card title="Customer">
            {customer.name || customer.email || customer.phone ? (
              <div className="space-y-3 text-[13px]">
                {customer.name && <p className="text-[14px] font-semibold text-slate-900">{customer.name}</p>}
                {customer.email && (
                  <ContactLine icon={<MailIcon />}>
                    <a href={`mailto:${customer.email}`} className="break-all text-brand-700 hover:text-brand-900 hover:underline">
                      {customer.email}
                    </a>
                  </ContactLine>
                )}
                {customer.phone && (
                  <ContactLine icon={<PhoneIcon />}>
                    <a href={`tel:${customer.phone.replace(/\s+/g, '')}`} className="text-brand-700 hover:text-brand-900 hover:underline">
                      {customer.phone}
                    </a>
                  </ContactLine>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-slate-500">No customer details on this shipment.</p>
            )}
          </Card>

          <Card title="Product">
            <dl className="space-y-2.5 text-[13px]">
              <Row label="Name" value={s.productDetails?.name || '—'} />
              <Row label="Product code" value={s.productDetails?.sku || '—'} mono />
              <Row label="Quantity" value={qty != null ? String(qty) : '—'} />
              <Row label="Category" value={s.productDetails?.category || '—'} />
            </dl>
          </Card>
        </div>
      </div>

      {editingDelivery && <EditDeliveryDialog shipment={s} onClose={() => setEditingDelivery(false)} />}
    </div>
  );
}

/** Which courier, with the contact details TrackingMore lists for it - for chasing. */
function CourierLine({ shipment }: { shipment: Shipment }) {
  const { byCode } = useCarriers();
  const courier = byCode.get(shipment.carrierCode);
  const phone = courier?.phone?.split(/[,;/]/)[0]?.trim();
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
      <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
        <CourierLogo courier={courier ?? { name: shipment.carrierName, logo: '' }} size={16} />
        {shipment.carrierName || shipment.carrierCode}
      </span>
      {phone && (
        <>
          <span aria-hidden className="text-slate-300">·</span>
          <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="hover:text-slate-800 hover:underline">
            {phone}
          </a>
        </>
      )}
      {courier?.url && (
        <>
          <span aria-hidden className="text-slate-300">·</span>
          <a href={courier.url} target="_blank" rel="noreferrer" className="hover:text-slate-800 hover:underline">
            Courier website
          </a>
        </>
      )}
    </p>
  );
}

/**
 * Beginning to completion at a glance: when processing started (first courier scan),
 * when it was delivered, and the total time between - or the time so far.
 */
function ProcessingBand({ shipment }: { shipment: Shipment }) {
  const t = processingTime(shipment);
  const stamp = (d: Date | null) => (d ? format(d, 'd MMM yyyy') : '—');
  const clock = (d: Date | null) => (d ? format(d, 'h:mm a') : '');

  return (
    <dl className="grid grid-cols-1 border-t border-slate-100 sm:grid-cols-[1fr_auto_1fr_1fr]">
      <div className="px-5 py-4 sm:px-6">
        <dt className="text-[12px] text-slate-500">Started</dt>
        <dd className="mt-1 text-[14px] font-medium text-slate-900">{stamp(t.start)}</dd>
        <dd className="text-[12px] text-slate-500">
          {t.start ? `${clock(t.start)} · ${t.startSource}` : 'No courier scan yet'}
        </dd>
      </div>

      <div aria-hidden className="hidden items-center text-slate-300 sm:flex">
        <svg width="28" height="12" viewBox="0 0 28 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 6h24m-5-4.5L25 6l-5 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="border-t border-slate-100 px-5 py-4 sm:border-t-0 sm:px-6">
        <dt className="text-[12px] text-slate-500">Completed</dt>
        {t.end ? (
          <>
            <dd className="mt-1 text-[14px] font-medium text-slate-900">{stamp(t.end)}</dd>
            <dd className="text-[12px] text-slate-500">{clock(t.end)} · delivered</dd>
          </>
        ) : t.inProgress ? (
          <>
            <dd className="mt-1 flex items-center gap-2 text-[14px] font-medium text-slate-900">
              <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
              In progress
            </dd>
            <dd className="text-[12px] text-slate-500">Not delivered yet</dd>
          </>
        ) : (
          <>
            <dd className="mt-1 text-[14px] font-medium text-slate-900">Delivered</dd>
            <dd className="text-[12px] text-slate-500">Delivery time not reported</dd>
          </>
        )}
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:border-l sm:border-t-0 sm:px-6">
        <dt className="text-[12px] text-slate-500">{t.inProgress ? 'Time so far' : 'Total time taken'}</dt>
        <dd className="mt-1 text-[18px] font-semibold tabular-nums tracking-[-0.01em] text-slate-950">
          {formatDuration(t.durationMs)}
        </dd>
        <dd className="text-[12px] text-slate-500">
          {t.durationMs == null ? 'Needs a start date' : t.inProgress ? 'Since the first scan, still counting' : 'Start to delivery'}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Where it's going and what it weighs/costs. The address entered for the client wins;
 * the courier's own destination (city + state, refreshed every sync) is shown beside it
 * - and flagged if the two disagree on the state.
 */
function DeliveryCard({ shipment: s, onEdit }: { shipment: Shipment; onEdit: () => void }) {
  const to = deliverTo(s);
  const mismatch = destinationMismatch(s);
  const route = s.carrierRoute;
  const hasRoute = !!(route?.destinationCity || route?.originCity);
  const fmtPlace = (city?: string, state?: string) => [city, state].filter(Boolean).join(', ');

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-slate-950">Delivery & charges</h2>
        <button
          onClick={onEdit}
          className="rounded-md px-2 py-1 text-[13px] font-medium text-brand-700 transition hover:bg-brand-50"
        >
          Edit
        </button>
      </div>

      <div className="text-[13px]">
        <p className="text-[12px] text-slate-500">Deliver to</p>
        {to.source ? (
          <div className="mt-1 flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0 text-slate-400">
              <PinIcon />
            </span>
            <div className="min-w-0">
              {to.line && <p className="text-slate-800">{to.line}</p>}
              {to.place && <p className="font-medium text-slate-900">{to.place}</p>}
              {to.source === 'courier' && (
                <p className="mt-0.5 text-[12px] text-slate-500">From the courier - add the full address with Edit.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-slate-500">
            No address yet.{' '}
            <button onClick={onEdit} className="font-medium text-brand-700 hover:text-brand-900">
              Add the client’s address
            </button>
          </p>
        )}

        {mismatch && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            {mismatch} Check the booking.
          </p>
        )}
      </div>

      {hasRoute && (
        <div className="mt-4 border-t border-slate-100 pt-3 text-[13px]">
          <p className="text-[12px] text-slate-500">Courier route</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 font-medium text-slate-900">
            <span>{fmtPlace(route?.originCity, route?.originState) || '—'}</span>
            <span aria-hidden className="text-slate-300">→</span>
            <span>{fmtPlace(route?.destinationCity, route?.destinationState) || '—'}</span>
          </p>
          {route?.fetchedAt && (
            <p className="mt-0.5 text-[12px] text-slate-400">
              Reported by {s.carrierName || 'the courier'} · {formatDistanceToNow(new Date(route.fetchedAt), { addSuffix: true })}
            </p>
          )}
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-[13px]">
        <div>
          <dt className="text-[12px] text-slate-500">Weight</dt>
          <dd className={clsx('mt-0.5 font-medium tabular-nums', s.weightKg == null ? 'text-slate-400' : 'text-slate-900')}>
            {formatWeight(s.weightKg)}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-slate-500">Freight</dt>
          <dd className={clsx('mt-0.5 font-medium tabular-nums', s.freightAmount == null ? 'text-slate-400' : 'text-slate-900')}>
            {formatINR(s.freightAmount)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

const actionButton =
  'inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

function Card({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-slate-950">{title}</h2>
        {aside && <span className="text-[12px] text-slate-400">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, extra, title }: { label: string; value: string; extra?: ReactNode; title?: string }) {
  return (
    <div className="min-w-0 bg-white px-5 py-4 sm:px-6">
      <dt className="text-[12px] text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-[14px] font-medium text-slate-900" title={title ?? value}>
        {value}
      </dd>
      {extra && <dd className="mt-0.5">{extra}</dd>}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={clsx('min-w-0 text-right font-medium text-slate-800', mono && 'font-mono text-[12px]')}>{value}</dd>
    </div>
  );
}

function ContactLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-slate-700">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}


const iconProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true } as const;

function LinkIcon() {
  return (
    <svg {...iconProps}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg {...iconProps} className={clsx(spinning && 'animate-spin motion-reduce:animate-[spin_1.6s_linear_infinite]')}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg {...iconProps}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg {...iconProps}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
