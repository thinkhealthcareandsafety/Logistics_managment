import clsx from 'clsx';
import { useAnalytics } from '../hooks/useAnalytics';
import { ALL_STATUSES, STATUS_LABELS, STATUS_STYLES } from '../utils/status';
import { StarRating } from '../components/StarRating';
import { WeekdayChart } from '../components/WeekdayChart';
import { LocationChart } from '../components/LocationChart';
import { Spinner } from '../components/ui/Loading';
import { DateRangeControl, useDateRange } from '../components/analytics/DateRange';
import { ReorderPredictions } from '../components/analytics/ReorderPredictions';
import type { AnalyticsSummary } from '../api/analytics';

import { AnalyticsSkeleton } from '../components/skeletons/PageSkeletons';


function formatDuration(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

function formatPercent(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}


export function Analytics() {
  const dateRange = useDateRange();
  const { data, isLoading, isError, isPlaceholderData, refetch } = useAnalytics({ from: dateRange.from, to: dateRange.to });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-[24px] font-semibold tracking-[-0.02em] text-slate-950">
            Analytics
            {isPlaceholderData && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium tracking-normal text-slate-500">
                <Spinner className="h-3.5 w-3.5" label="Updating analytics for the new date range" />
                Updating…
              </span>
            )}
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Performance across every courier you ship with, measured from real checkpoint timestamps.
          </p>
        </div>

        <DateRangeControl state={dateRange} />
      </header>

      {isLoading && <AnalyticsSkeleton />}

      {isError && !data && (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-slate-900">Couldn’t load analytics</p>
          <button onClick={() => refetch()} className="btn-secondary mt-4 h-8 px-3 py-0 text-[13px]">
            Try again
          </button>
        </div>
      )}

      {data && data.totalShipments === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-slate-900">No shipments in this range</p>
          <p className="mt-1 text-[13px] text-slate-500">Widen the date range, or add shipments to start measuring.</p>
        </div>
      )}

      {data && data.totalShipments > 0 && (
        <div className={clsx('transition-opacity', isPlaceholderData && 'opacity-60')} aria-busy={isPlaceholderData}>
          <Summary data={data} />
        </div>
      )}

      {/* From all past orders, not the date range above. */}
      {!isLoading && <ReorderPredictions />}
    </div>
  );
}


function Summary({ data }: { data: AnalyticsSummary }) {
  const onTimePct = data.onTimeDeliveryRate === null ? null : Math.round(data.onTimeDeliveryRate * 100);
  // Across every courier - the per-courier split is in the comparison table below.
  const exceptionPct = Math.round((data.exceptionRate ?? 0) * 100);

  return (
    <>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Average transit time"
          value={formatDuration(data.averageTransitHours)}
          footnote={
            data.totalDelivered === 0
              ? 'No delivered shipments yet'
              : data.totalDelivered === 1
                ? 'Based on 1 delivered shipment'
                : `${data.totalDelivered} delivered · range ${formatDuration(data.fastestTransitHours)} – ${formatDuration(data.slowestTransitHours)}`
          }
        />
        <Metric
          label="On-time delivery"
          value={formatPercent(data.onTimeDeliveryRate)}
          footnote={
            data.onTimeEligible > 0
              ? `${data.onTimeCount} of ${data.onTimeEligible} delivered by their promised date`
              : 'Needs a delivered shipment with an ETA'
          }
          bar={onTimePct === null ? undefined : { pct: onTimePct, tone: onTimePct >= 90 ? 'good' : onTimePct >= 70 ? 'warn' : 'bad' }}
        />
        <Metric
          label="Exception rate"
          value={`${exceptionPct}%`}
          footnote={`${data.exceptionCount} of ${data.totalShipments} shipments held up`}
          bar={{ pct: exceptionPct, tone: exceptionPct === 0 ? 'good' : exceptionPct <= 10 ? 'warn' : 'bad' }}
        />
        <Metric
          label="Past promised date"
          value={data.lateCount}
          tone={data.lateCount > 0 ? 'danger' : undefined}
          footnote={
            data.lateCount > 0 ? 'Still undelivered and already overdue' : 'Nothing overdue right now'
          }
        />
      </div>

      <WeekdayChart rows={data.weekdayBreakdown} />

      <LocationChart
        cities={data.locationBreakdown.cities}
        states={data.locationBreakdown.states}
        unknown={data.locationBreakdown.unknown}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-slate-950">Customer satisfaction</h2>
          <span className="text-[13px] tabular-nums text-slate-500">
            {data.feedbackCount} of {data.feedbackEligible} delivered orders rated
          </span>
        </div>

        {data.feedbackCount === 0 ? (
          <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
            No ratings yet. Customers are asked for feedback automatically when their order is marked delivered.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-x-10 gap-y-4">
            <div className="flex items-center gap-3">
              <span className="text-4xl font-semibold tabular-nums -tracking-[0.02em] text-slate-900">
                {data.averageRating!.toFixed(1)}
              </span>
              <div>
                <StarRating value={Math.round(data.averageRating!)} size="sm" />
                <p className="mt-0.5 text-xs text-slate-500">average of {data.feedbackCount}</p>
              </div>
            </div>

            <div className="w-full min-w-[200px] max-w-sm space-y-1">
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const count = data.ratingBreakdown[String(star) as '1'] || 0;
                const pct = data.feedbackCount ? (count / data.feedbackCount) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-2">
                    <span className="w-3 text-right text-xs tabular-nums text-slate-500">{star}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-5 text-right text-xs tabular-nums text-slate-500">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-slate-950">Where shipments are sitting</h2>
          <span className="text-[13px] tabular-nums text-slate-500">{data.totalShipments} total</span>
        </div>

        {/* One stacked bar reads faster than five numbers, and the legend below keeps
            the exact counts available without a tooltip. */}
        <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          {ALL_STATUSES.map((status) => {
            const count = data.statusBreakdown[status] || 0;
            if (count === 0) return null;
            return (
              <span
                key={status}
                className={STATUS_STYLES[status].dot}
                style={{ width: `${(count / data.totalShipments) * 100}%` }}
                title={`${STATUS_LABELS[status]}: ${count}`}
              />
            );
          })}
        </div>

        <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-2.5">
          {ALL_STATUSES.map((status) => {
            const count = data.statusBreakdown[status] || 0;
            return (
              <div key={status} className="flex items-center gap-2">
                <span className={clsx('h-2 w-2 shrink-0 rounded-full', STATUS_STYLES[status].dot)} aria-hidden />
                <dt className="text-[13px] text-slate-600">{STATUS_LABELS[status]}</dt>
                <dd className={clsx('text-[13px] font-semibold tabular-nums', count === 0 ? 'text-slate-300' : 'text-slate-900')}>
                  {count}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
    </>
  );
}

/**
 * Couriers side by side over the selected range. A table, not a chart: four measures
 * on different scales (count, days, two percentages) can't share an axis, and the
 * exact numbers are what a "which courier for this lane" decision needs.
 */
function Metric({
  label,
  value,
  footnote,
  bar,
  tone,
}: {
  label: string;
  value: string | number;
  footnote: string;
  bar?: { pct: number; tone: 'good' | 'warn' | 'bad' };
  tone?: 'danger';
}) {
  return (
    <div className="min-w-0 bg-white px-5 py-4">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <p
        className={clsx(
          'mt-2 text-[28px] font-semibold leading-none tabular-nums tracking-[-0.02em]',
          tone === 'danger' ? 'text-red-600' : 'text-slate-950'
        )}
      >
        {value}
      </p>

      {bar && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <span
            className={clsx(
              'block h-full rounded-full',
              bar.tone === 'good' && 'bg-emerald-500',
              bar.tone === 'warn' && 'bg-amber-500',
              bar.tone === 'bad' && 'bg-red-500'
            )}
            style={{ width: `${Math.min(100, Math.max(0, bar.pct))}%` }}
          />
        </div>
      )}

      <p className="mt-2 text-[12px] leading-snug text-slate-500">{footnote}</p>
    </div>
  );
}
