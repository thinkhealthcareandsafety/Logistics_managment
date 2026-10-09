import { useState } from 'react';
import clsx from 'clsx';
import { SegmentedControl } from './SegmentedControl';
import { DownloadCsvButton } from './DownloadCsvButton';
import type { WeekdayRow } from '../api/analytics';

type Measure = 'orders' | 'shipments' | 'units' | 'deliveries';

const MEASURES: Record<Measure, { label: string; noun: [string, string]; hint: string }> = {
  orders: { label: 'Orders', noun: ['order', 'orders'], hint: 'by the day they were booked' },
  shipments: { label: 'Shipments', noun: ['shipment', 'shipments'], hint: 'by the day the courier picked them up' },
  units: { label: 'Units', noun: ['unit', 'units'], hint: 'shipped, by booking day' },
  deliveries: { label: 'Deliveries', noun: ['delivery', 'deliveries'], hint: 'by the day they were delivered' },
};

/**
 * Single-series column chart. Validated with the dataviz palette checker: #00899e
 * clears the lightness band, the chroma floor and 3:1 contrast on white (the brand
 * #2c8290 reads gray as a data color). One color for every column - the day is
 * identity, not magnitude, so no value ramp.
 */
const BAR = '#00899e';
const PLOT_H = 168;

const short = (day: string) => day.slice(0, 3);
const noun = (m: Measure, n: number) => MEASURES[m].noun[n === 1 ? 0 : 1];

/** Rounds the axis top up to a clean number: 2, 4, 5, 10, 20, 25, 50, 100… */
function niceMax(max: number) {
  if (max <= 2) return 2;
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const s of [1, 2, 2.5, 5, 10]) if (s * pow >= max) return s * pow;
  return 10 * pow;
}

export function WeekdayChart({ rows }: { rows: WeekdayRow[] }) {
  const [measure, setMeasure] = useState<Measure>('orders');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [active, setActive] = useState<number | null>(null);

  const values = rows.map((r) => r[measure]);
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(...values, 0);
  const top = niceMax(max);
  const ticks = [top, top / 2, 0];
  const peak = max > 0 ? values.indexOf(max) : -1;
  const ties = values.filter((v) => v === max).length;
  const nonZero = values.map((v, i) => ({ v, i })).filter((x) => x.v > 0);
  const quietest = nonZero.length === 7 ? nonZero.reduce((a, b) => (b.v < a.v ? b : a)) : null;
  const zeroDays = rows.filter((_, i) => values[i] === 0).map((r) => short(r.day));
  const weekend = values[5] + values[6];
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-950">{MEASURES[measure].label} by day of the week</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            {MEASURES[measure].label} {MEASURES[measure].hint} · India time · follows the date range above
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {/* Same columns as the table; the share column follows the measure picked above. */}
          <DownloadCsvButton
            name={`${measure}-by-day-of-week`}
            headers={['Day', 'Orders', 'Shipments', 'Units', 'Deliveries', `Share of ${MEASURES[measure].noun[1]} (%)`]}
            rows={total === 0 ? [] : rows.map((r, i) => [r.day, r.orders, r.shipments, r.units, r.deliveries, pct(values[i])])}
          />
        </div>
      </div>

      {total === 0 ? (
        <p className="py-12 text-center text-[13px] text-slate-500">
          No {MEASURES[measure].noun[1]} in this date range yet.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_240px]">
          {view === 'chart' ? (
            <div className="min-w-0">
              <div className="flex">
                {/* Y axis - clean ticks, recessive */}
                <div className="relative mr-2 w-8 shrink-0" style={{ height: PLOT_H }} aria-hidden>
                  {ticks.map((t) => (
                    <span
                      key={t}
                      className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-slate-400"
                      style={{ top: `${(1 - t / top) * 100}%` }}
                    >
                      {Number.isInteger(t) ? t.toLocaleString('en-IN') : t.toFixed(1)}
                    </span>
                  ))}
                </div>

                <div className="relative min-w-0 flex-1">
                  {/* Hairline solid gridlines */}
                  <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: PLOT_H }} aria-hidden>
                    {ticks.map((t) => (
                      <div
                        key={t}
                        className={clsx('absolute inset-x-0 h-px', t === 0 ? 'bg-slate-300' : 'bg-slate-100')}
                        style={{ top: `${(1 - t / top) * 100}%` }}
                      />
                    ))}
                  </div>

                  <ul className="relative grid grid-cols-7" style={{ height: PLOT_H }}>
                    {rows.map((row, i) => {
                      const v = values[i];
                      const h = (v / top) * PLOT_H;
                      const label = `${row.day}: ${v.toLocaleString('en-IN')} ${noun(measure, v)} (${pct(v)}% of the week)`;
                      return (
                        <li key={row.day} className="relative flex justify-center">
                          {/* Whole slot is the hit target - not just the bar */}
                          <button
                            type="button"
                            aria-label={label}
                            onMouseEnter={() => setActive(i)}
                            onMouseLeave={() => setActive(null)}
                            onFocus={() => setActive(i)}
                            onBlur={() => setActive(null)}
                            className="group absolute inset-0 flex items-end justify-center rounded-md outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            {v > 0 && (
                              <span
                                className="block w-full max-w-[24px] rounded-t-[4px] transition-opacity"
                                style={{
                                  height: Math.max(h, 2),
                                  background: BAR,
                                  opacity: active === null || active === i ? 1 : 0.45,
                                }}
                              />
                            )}
                          </button>

                          {/* Value on every column (7 at most, so it stays readable); the busiest day
                              keeps the strongest weight so it still stands out. */}
                          <span
                            className={clsx(
                              'pointer-events-none absolute pb-1 text-[12px] leading-none tabular-nums',
                              i === peak && ties === 1 ? 'font-semibold text-slate-900' : 'font-medium text-slate-600',
                              v === 0 && 'text-slate-400'
                            )}
                            style={{ bottom: v > 0 ? h : 0 }}
                          >
                            {v.toLocaleString('en-IN')}
                          </span>

                          {active === i && (
                            <span
                              role="tooltip"
                              className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] text-white shadow-lg"
                              // Clears the value label sitting on the column.
                              style={{ bottom: (v > 0 ? h : 0) + 22 }}
                            >
                              <span className="font-semibold">{row.day}</span>
                              <span className="text-white/70">
                                {' '}
                                · {v.toLocaleString('en-IN')} {noun(measure, v)} · {pct(v)}%
                              </span>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {/* X axis */}
                  <ul className="mt-2 grid grid-cols-7" aria-hidden>
                    {rows.map((row, i) => (
                      <li
                        key={row.day}
                        className={clsx(
                          'text-center text-[12px]',
                          i === peak && ties === 1 ? 'font-semibold text-slate-900' : 'text-slate-500'
                        )}
                      >
                        <span className="sm:hidden">{row.day.slice(0, 2)}</span>
                        <span className="hidden sm:inline">{short(row.day)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[12px] text-slate-500">
                    <th scope="col" className="py-2 pr-4 font-medium">Day</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Orders</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Shipments</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Units</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Deliveries</th>
                    <th scope="col" className="py-2 text-right font-medium">Share of {MEASURES[measure].noun[1]}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {rows.map((r, i) => (
                    <tr key={r.day} className={clsx(i === peak && ties === 1 && 'font-semibold text-slate-950')}>
                      <th scope="row" className="py-2 pr-4 text-left font-medium text-slate-800">{r.day}</th>
                      <td className="py-2 pr-4 text-right text-slate-700">{r.orders}</td>
                      <td className="py-2 pr-4 text-right text-slate-700">{r.shipments}</td>
                      <td className="py-2 pr-4 text-right text-slate-700">{r.units.toLocaleString('en-IN')}</td>
                      <td className="py-2 pr-4 text-right text-slate-700">{r.deliveries}</td>
                      <td className="py-2 text-right text-slate-500">{pct(values[i])}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* The read-out: what the chart says, in words */}
          <dl className="space-y-4 border-t border-slate-100 pt-4 text-[13px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div>
              <dt className="text-[12px] text-slate-500">Busiest day</dt>
              <dd className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-slate-950">
                {ties === 1 ? rows[peak].day : `${ties} days tie`}
              </dd>
              <dd className="text-slate-600">
                {max.toLocaleString('en-IN')} {noun(measure, max)}
                {ties === 1 && ` · ${pct(max)}% of the week`}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-slate-500">{quietest ? 'Quietest day' : 'No activity on'}</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {quietest
                  ? `${rows[quietest.i].day} · ${quietest.v.toLocaleString('en-IN')} ${noun(measure, quietest.v)}`
                  : zeroDays.join(', ')}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-slate-500">Weekend (Sat + Sun)</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {weekend.toLocaleString('en-IN')} {noun(measure, weekend)} · {pct(weekend)}%
              </dd>
            </div>
            <div className="text-[12px] text-slate-400">
              {total.toLocaleString('en-IN')} {noun(measure, total)} in this range
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
