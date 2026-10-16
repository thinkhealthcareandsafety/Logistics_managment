import clsx from 'clsx';
import { DownloadCsvButton } from '../DownloadCsvButton';
import type { ExceptionRateByCarrier } from '../../api/analytics';

function formatDuration(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

/** Every courier side by side: shipments, deliveries, transit, on time, exceptions. */
/** Own van, bus parcels, hand delivery - not courier partners, so not compared here. */
const NOT_A_COURIER = /(self|other|hand|own|bus|travels)/i;

export function CourierComparison({ rows: all }: { rows: ExceptionRateByCarrier[] }) {
  const rows = all.filter((r) => !NOT_A_COURIER.test(r.carrierName));
  const hidden = all.length - rows.length;
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
        <div className="flex items-center gap-3">
          <span className="text-[13px] tabular-nums text-slate-500">
            {rows.length} courier{rows.length === 1 ? '' : 's'} in this range
            {hidden > 0 && ' · bus, self delivery and other non-courier deliveries not shown'}
          </span>
          {/* Plain numbers (hours, percentages) so the file sorts and sums in Excel. */}
          <DownloadCsvButton
            name="courier-comparison"
            headers={['Courier', 'Shipments', 'Delivered', 'Avg transit (hours)', 'On time (%)', 'On time', 'Due-dated deliveries', 'Exceptions', 'Exception rate (%)']}
            rows={rows.map((r) => [
              r.carrierName,
              r.total,
              r.delivered,
              r.averageTransitHours == null ? '' : Math.round(r.averageTransitHours * 10) / 10,
              r.onTimeRate == null ? '' : Math.round(r.onTimeRate * 100),
              r.onTimeCount,
              r.onTimeEligible,
              r.exceptions,
              Math.round(r.rate * 100),
            ])}
          />
        </div>
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
