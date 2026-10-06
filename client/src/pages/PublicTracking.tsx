import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format } from 'date-fns';
import { publicTrackingApi } from '../api/publicTracking';
import { StatusBadge } from '../components/StatusBadge';
import { TrackLookup } from '../components/marketing/TrackLookup';
import { ProgressRail } from '../components/ProgressRail';
import { STATUS_LABELS } from '../utils/status';
import type { ShipmentStatus } from '../types/shipment';

export function PublicTracking() {
  const { trackingNumber } = useParams<{ trackingNumber: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-tracking', trackingNumber],
    queryFn: () => publicTrackingApi.get(trackingNumber as string),
    enabled: !!trackingNumber,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3.5">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-900 text-sm font-bold text-white">
              TH
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-slate-900">ThinkHealth</span>
              <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-400">Logistics</span>
            </span>
          </Link>
          <div className="hidden w-72 sm:block">
            <TrackLookup size="sm" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {isLoading && (
          <div className="space-y-4">
            <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          </div>
        )}

        {isError && (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-card">
            <h1 className="text-lg font-semibold text-slate-900">We couldn’t find that shipment</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              Nothing is tracking under <span className="font-mono text-slate-700">{trackingNumber}</span>. Double-check
              the number — it can take a few hours to appear after booking.
            </p>
            <div className="mx-auto mt-7 max-w-sm">
              <TrackLookup />
            </div>
          </div>
        )}

        {data && (
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Tracking number</p>
                  <p className="mt-1 font-mono text-xl font-semibold text-slate-900">{data.trackingNumber}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {data.carrierName}
                    {data.productName ? ` · ${data.productName}` : ''}
                  </p>
                </div>
                <StatusBadge status={data.status} variant="pill" className="text-sm" />
              </div>

              <ProgressTrack status={data.status} />

              {/* Say it before the customer has to ask - an unexplained past date is
                  exactly what makes them pick up the phone. */}
              <DelayNotice status={data.status} estimatedDelivery={data.estimatedDelivery} />

              <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-3">
                <Fact label="Current location" value={data.currentLocation || '—'} />
                {data.status === 'delivered' && data.deliveredAt ? (
                  <Fact label="Delivered" value={format(new Date(data.deliveredAt), 'MMM d, yyyy · h:mm a')} />
                ) : (
                  <Fact
                    label="Estimated delivery"
                    value={data.estimatedDelivery ? format(new Date(data.estimatedDelivery), 'MMM d, yyyy') : '—'}
                  />
                )}
                <Fact
                  label="Last checked"
                  value={data.lastCheckedAt ? format(new Date(data.lastCheckedAt), 'MMM d, h:mm a') : '—'}
                />
              </dl>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Tracking history</h2>
              {data.checkpoints.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No checkpoint history yet. Updates appear here as the carrier scans the parcel.
                </p>
              ) : (
                <ol className="relative mt-5 ml-1.5 space-y-6 border-l border-slate-200 pl-6">
                  {[...data.checkpoints].reverse().map((cp, idx) => (
                    <li key={`${cp.checkpointTime}-${idx}`} className="relative">
                      <span
                        className={`absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white ${
                          idx === 0 ? 'bg-brand-600' : 'bg-slate-300'
                        }`}
                      />
                      <p className={`text-sm font-medium ${idx === 0 ? 'text-slate-900' : 'text-slate-700'}`}>
                        {cp.description || STATUS_LABELS[cp.status]}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {cp.location ? `${cp.location} · ` : ''}
                        {format(new Date(cp.checkpointTime), 'MMM d, yyyy · h:mm a')}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <p className="pb-4 text-center text-xs text-slate-400">
              Shared by ThinkHealth Logistics. This page shows delivery progress only — no account details.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * An exception gets a plain-language notice rather than a position on the rail - a
 * stuck parcel isn't partway delivered, and the wording here is for the customer,
 * not the ops team.
 */
function ProgressTrack({ status }: { status: ShipmentStatus }) {
  if (status === 'exception') {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
        <p className="text-sm leading-relaxed text-red-800">
          This shipment has hit a snag and our team is following it up. The history below has the latest carrier update.
        </p>
      </div>
    );
  }

  return <ProgressRail status={status} showLabels className="mt-6" />;
}

/** Late but still moving. Exceptions already carry their own notice in ProgressTrack. */
function DelayNotice({ status, estimatedDelivery }: { status: ShipmentStatus; estimatedDelivery?: string }) {
  if (!estimatedDelivery || status === 'delivered' || status === 'exception') return null;
  if (differenceInCalendarDays(new Date(estimatedDelivery), new Date()) >= 0) return null;

  return (
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
      <p className="text-sm leading-relaxed text-amber-900">
        This delivery is running behind the estimated date. It's still moving, and our team is keeping an eye on it -
        the latest scan is at the top of the history below.
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.12em] text-slate-400">{label}</dt>
      <dd className="mt-1 font-medium text-slate-800">{value}</dd>
    </div>
  );
}
