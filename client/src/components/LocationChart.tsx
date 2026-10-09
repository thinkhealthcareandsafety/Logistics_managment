import { useState } from 'react';
import clsx from 'clsx';
import { SegmentedControl } from './SegmentedControl';
import { DownloadCsvButton } from './DownloadCsvButton';
import type { LocationRow } from '../api/analytics';

type Level = 'cities' | 'states';
type Measure = 'orders' | 'units' | 'freight';

const MEASURES: Record<Measure, { label: string; noun: [string, string] }> = {
  orders: { label: 'Orders', noun: ['order', 'orders'] },
  units: { label: 'Units', noun: ['unit', 'units'] },
  freight: { label: 'Freight', noun: ['', ''] },
};

/** Same validated single-series color as the weekday chart (#00899e passes the checks). */
const BAR = '#00899e';
const TOP_N = 10;

function fmt(m: Measure, n: number) {
  if (m === 'freight') return `₹${Math.round(n).toLocaleString('en-IN')}`;
  return `${n.toLocaleString('en-IN')} ${MEASURES[m].noun[n === 1 ? 0 : 1]}`;
}
const short = (m: Measure, n: number) => (m === 'freight' ? `₹${Math.round(n).toLocaleString('en-IN')}` : n.toLocaleString('en-IN'));

/**
 * Which locations buy the most. Ranked horizontal bars - the right form for comparing
 * named places (long labels read horizontally, the order is the story). One color for
 * every bar; the place is identity, not magnitude.
 */
export function LocationChart({
  cities,
  states,
  unknown,
}: {
  cities: LocationRow[];
  states: LocationRow[];
  unknown: number;
}) {
  const [level, setLevel] = useState<Level>('cities');
  const [measure, setMeasure] = useState<Measure>('orders');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [active, setActive] = useState<string | null>(null);

  const source = level === 'cities' ? cities : states;
  const rows = [...source].sort((a, b) => b[measure] - a[measure] || b.orders - a.orders);
  const shown = rows.slice(0, TOP_N);
  const rest = rows.length - shown.length;
  const total = rows.reduce((sum, r) => sum + r[measure], 0);
  const max = Math.max(...shown.map((r) => r[measure]), 0);
  const top = shown[0];
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const top3 = shown.slice(0, 3).reduce((s, r) => s + r[measure], 0);
  const noFreight = measure === 'freight' && total === 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-950">Where orders go</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            By delivery address, or the courier’s destination when there isn’t one · follows the date range above
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<Level>
            label="Location level"
            value={level}
            onChange={setLevel}
            segments={[
              { value: 'cities', label: 'City', count: cities.length },
              { value: 'states', label: 'State', count: states.length },
            ]}
          />
          <SegmentedControl<Measure>
            label="Measure"
            value={measure}
            onChange={setMeasure}
            segments={(Object.keys(MEASURES) as Measure[]).map((m) => ({ value: m, label: MEASURES[m].label }))}
          />
          <SegmentedControl<'chart' | 'table'>
            label="View"
            value={view}
            onChange={setView}
            segments={[
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ]}
          />
          {/* Every location (not just the top 10 the chart shows), ranked by the chosen measure. */}
          <DownloadCsvButton
            name={`orders-by-${level === 'cities' ? 'city' : 'state'}`}
            headers={['Rank', level === 'cities' ? 'City' : 'State', 'Orders', 'Units', 'Freight (INR)', `Share of ${MEASURES[measure].label.toLowerCase()} (%)`]}
            rows={rows.map((r, i) => [i + 1, r.label, r.orders, r.units, Math.round(r.freight), pct(r[measure])])}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-slate-500">
          No delivery locations yet - add the client’s address to shipments, or wait for the courier’s first scan.
        </p>
      ) : noFreight ? (
        <p className="py-12 text-center text-[13px] text-slate-500">
          No freight recorded in this range. Add freight to shipments to compare locations by spend.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_240px]">
          {view === 'chart' ? (
            <ol className="min-w-0 space-y-1">
              {shown.map((r, i) => {
                const v = r[measure];
                const w = max ? (v / max) * 100 : 0;
                return (
                  <li key={r.key} className="relative">
                    <button
                      type="button"
                      aria-label={`${i + 1}. ${r.label}: ${fmt(measure, v)} (${pct(v)}%)`}
                      onMouseEnter={() => setActive(r.key)}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive(r.key)}
                      onBlur={() => setActive(null)}
                      className="grid w-full grid-cols-[1.25rem_minmax(0,7rem)_1fr] items-center gap-3 rounded-md px-1 py-1.5 text-left outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500 sm:grid-cols-[1.25rem_minmax(0,12rem)_1fr]"
                    >
                      <span className="text-right font-mono text-[11px] text-slate-400">{i + 1}</span>
                      <span className={clsx('truncate text-[13px]', i === 0 ? 'font-semibold text-slate-950' : 'text-slate-700')} title={r.label}>
                        {r.label}
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="block h-[18px] shrink-0 rounded-r-[4px] transition-opacity"
                          style={{
                            width: `max(${w}%, ${v > 0 ? 2 : 0}px)`,
                            maxWidth: 'calc(100% - 4.5rem)',
                            background: BAR,
                            opacity: active === null || active === r.key ? 1 : 0.45,
                          }}
                        />
                        <span className={clsx('shrink-0 text-[12px] tabular-nums', i === 0 ? 'font-semibold text-slate-900' : 'font-medium text-slate-600')}>
                          {short(measure, v)}
                        </span>
                      </span>
                    </button>
                    {active === r.key && (
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] text-white shadow-lg"
                      >
                        <span className="font-semibold">{r.label}</span>
                        <span className="text-white/70">
                          {' '}
                          · {r.orders} order{r.orders === 1 ? '' : 's'} · {r.units.toLocaleString('en-IN')} units
                          {r.freight ? ` · ₹${Math.round(r.freight).toLocaleString('en-IN')}` : ''}
                        </span>
                      </span>
                    )}
                  </li>
                );
              })}
              {rest > 0 && (
                <li className="pl-9 pt-1 text-[12px] text-slate-400">
                  + {rest} more {level === 'cities' ? 'cit' + (rest === 1 ? 'y' : 'ies') : 'state' + (rest === 1 ? '' : 's')} - see Table
                </li>
              )}
            </ol>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[12px] text-slate-500">
                    <th scope="col" className="py-2 pr-3 font-medium">#</th>
                    <th scope="col" className="py-2 pr-4 font-medium">{level === 'cities' ? 'City' : 'State'}</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Orders</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Units</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Freight</th>
                    <th scope="col" className="py-2 text-right font-medium">Share of {MEASURES[measure].label.toLowerCase()}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {rows.map((r, i) => (
                    <tr key={r.key} className={clsx(i === 0 && 'font-semibold text-slate-950')}>
                      <td className="py-2 pr-3 text-slate-400">{i + 1}</td>
                      <th scope="row" className="py-2 pr-4 text-left font-medium text-slate-800">{r.label}</th>
                      <td className="py-2 pr-4 text-right text-slate-700">{r.orders}</td>
                      <td className="py-2 pr-4 text-right text-slate-700">{r.units.toLocaleString('en-IN')}</td>
                      <td className="py-2 pr-4 text-right text-slate-700">₹{Math.round(r.freight).toLocaleString('en-IN')}</td>
                      <td className="py-2 text-right text-slate-500">{pct(r[measure])}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* The read-out: the answer to "which location buys more", in words */}
          <dl className="space-y-4 border-t border-slate-100 pt-4 text-[13px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div>
              <dt className="text-[12px] text-slate-500">Top {level === 'cities' ? 'city' : 'state'}</dt>
              <dd className="mt-1 text-[20px] font-semibold leading-tight tracking-[-0.01em] text-slate-950">{top.label}</dd>
              <dd className="text-slate-600">
                {fmt(measure, top[measure])} · {pct(top[measure])}% of the total
              </dd>
            </div>
            {shown.length >= 3 && (
              <div>
                <dt className="text-[12px] text-slate-500">Top 3 together</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{pct(top3)}% of {MEASURES[measure].label.toLowerCase()}</dd>
              </div>
            )}
            <div>
              <dt className="text-[12px] text-slate-500">Locations</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {rows.length} {level === 'cities' ? (rows.length === 1 ? 'city' : 'cities') : rows.length === 1 ? 'state' : 'states'}
              </dd>
            </div>
            {unknown > 0 && (
              <div className="text-[12px] leading-snug text-slate-400">
                {unknown} shipment{unknown === 1 ? ' has' : 's have'} no location yet - add the delivery address to include
                {unknown === 1 ? ' it' : ' them'}.
              </div>
            )}
          </dl>
        </div>
      )}
    </section>
  );
}
