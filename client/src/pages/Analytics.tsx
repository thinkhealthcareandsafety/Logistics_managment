import { useState } from 'react';
import clsx from 'clsx';
import { useAnalytics } from '../hooks/useAnalytics';
import { ALL_STATUSES, STATUS_LABELS, STATUS_STYLES } from '../utils/status';
import { StarRating } from '../components/StarRating';
import { SegmentedControl } from '../components/SegmentedControl';
import { WeekdayChart } from '../components/WeekdayChart';
import { LocationChart } from '../components/LocationChart';
import type { AnalyticsSummary, ExceptionRateByCarrier } from '../api/analytics';

const RANGE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatDuration(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

function formatPercent(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}

type RangeKey = '7' | '30' | '90' | 'all' | 'custom';

export function Analytics() {
  const [range, setRange] = useState<RangeKey>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const from = range === 'custom' ? customFrom : range === 'all' ? '' : isoDaysAgo(Number(range));
  const to = range === 'custom' ? customTo : '';
  const { data, isLoading } = useAnalytics({ from: from || undefined, to: to || undefined });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-slate-950">Analytics</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Performance across every courier you ship with, measured from real checkpoint timestamps.
          </p>
        </div>

        <div className="flex max-w-full flex-col items-stretch gap-2 sm:items-end">
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            <SegmentedControl<RangeKey>
              label="Date range"
              value={range}
              onChange={setRange}
              segments={[
                ...RANGE_PRESETS.map((p) => ({ value: String(p.days) as RangeKey, label: p.label })),
                { value: 'all', label: 'All time' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
          </div>
          {range === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
              <label className="flex items-center gap-2">
                <span>From</span>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="input h-8 w-auto py-0 text-[13px]"
                />
              </label>
              <label className="flex items-center gap-2">
                <span>to</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="input h-8 w-auto py-0 text-[13px]"
                />
              </label>
            </div>
          )}
        </div>
      </header>

      {isLoading && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse bg-white" />
          ))}
        </div>
      )}

      {data && data.totalShipments === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-slate-900">No shipments in this range</p>
          <p className="mt-1 text-[13px] text-slate-500">Widen the date range, or add shipments to start measuring.</p>
        </div>
      )}

      {data && data.totalShipments > 0 && <Summary data={data} />}
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

      <CourierComparison rows={data.exceptionRateByCarrier} />

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
function CourierComparison({ rows }: { rows: ExceptionRateByCarrier[] }) {
  if (rows.length === 0) return null;
  // "Fastest" only means something with at least two couriers that have deliveries.
  const timed = rows.filter((r) => r.averageTransitHours != null);
  const fastest =
    timed.length >= 2
      ? timed.reduce((a, b) => (b.averageTransitHours! < a.averageTransitHours! ? b : a))
      : null;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <h2 className="text-[15px] font-semibold text-slate-950">Courier comparison</h2>
        <span className="text-[13px] tabular-nums text-slate-500">
          {rows.length} courier{rows.length === 1 ? '' : 's'} in this range
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[13px]">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50/70 text-[12px] text-slate-500">
              <th scope="col" className="px-5 py-2.5 font-medium">Courier</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Shipments</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Delivered</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Avg transit</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">On time</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Exceptions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {rows.map((r) => (
              <tr key={r.carrierCode}>
                <th scope="row" className="px-5 py-3 text-left font-medium text-slate-900">
                  {r.carrierName}
                  {fastest && rows.length > 1 && fastest.carrierCode === r.carrierCode && (
                    <span className="ml-2 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      Fastest
                    </span>
                  )}
                </th>
                <td className="px-3 py-3 text-right text-slate-700">{r.total}</td>
                <td className="px-3 py-3 text-right text-slate-700">{r.delivered}</td>
                <td className="px-3 py-3 text-right text-slate-700">{formatDuration(r.averageTransitHours)}</td>
                <td className="px-3 py-3 text-right text-slate-700">
                  {r.onTimeRate == null ? '—' : `${Math.round(r.onTimeRate * 100)}%`}
                  {r.onTimeEligible > 0 && (
                    <span className="ml-1 text-[12px] text-slate-400">
                      ({r.onTimeCount}/{r.onTimeEligible})
                    </span>
                  )}
                </td>
                <td className={clsx('px-5 py-3 text-right', r.exceptions ? 'font-medium text-red-600' : 'text-slate-700')}>
                  {r.exceptions} · {Math.round(r.rate * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

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
