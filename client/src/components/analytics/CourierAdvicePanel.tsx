import clsx from 'clsx';
import type { CourierAdvice } from '../../api/analytics';
import { DownloadCsvButton } from '../DownloadCsvButton';

const inr = (n: number | null | undefined) => (n == null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`);
const days = (h: number | null) => (h == null ? '—' : h < 24 ? 'same day' : `${(h / 24).toFixed(1)} days`);
const speedText = (i: number | null) =>
  i == null ? 'not enough comparable trips' : i >= 1.15 ? `${i.toFixed(1)}× faster than typical` : i <= 0.87 ? `${(1 / i).toFixed(1)}× slower than typical` : 'about typical speed';

/**
 * Which courier partner to use, and whose charges are affordable - from this range's
 * shipments: reliability, speed compared on the same destinations, and the freight on
 * Zoho invoices / the master sheet.
 */
export function CourierAdvicePanel({ advice }: { advice: CourierAdvice | null }) {
  if (!advice) return null;
  const { recommended, ranking, fastest, cheapest, mostReliable, freightCoverage, byState } = advice;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-950">Courier recommendation</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Reliability 40% · speed on the same destinations 35% · freight 25% · couriers with 5+ shipments in this range
          </p>
        </div>
        <DownloadCsvButton
          name="courier-recommendation"
          headers={['Courier', 'Shipments', 'Score', 'Reliability', 'Speed', 'Cost', 'Speed vs typical', 'Comparable trips', 'Typical freight (Rs)', 'Data']}
          rows={ranking.map((r) => [
            r.carrierName,
            r.shipments,
            r.score,
            r.reliability,
            r.speed,
            r.cost,
            r.speedIndex ?? '',
            r.comparableTrips,
            r.medianFreight ?? '',
            r.evidence === 2 ? 'full' : r.evidence === 1 ? 'limited' : 'not enough',
          ])}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-px border-y border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
        <Pick
          label="Recommended"
          name={recommended?.carrierName}
          detail={recommended ? `Score ${recommended.score}/100${recommended.medianFreight != null ? ` · typically ${inr(recommended.medianFreight)}` : ''}` : 'Not enough data yet'}
          strong
        />
        <Pick label="Most affordable" name={cheapest?.carrierName} detail={cheapest ? `Typically ${inr(cheapest.value)} a shipment` : 'Needs freight on 3+ shipments per courier'} />
        <Pick label="Fastest for its routes" name={fastest?.carrierName} detail={fastest ? speedText(fastest.value) : 'Needs trips to shared destinations'} />
        <Pick
          label="Fewest problems"
          name={mostReliable?.carrierName}
          detail={mostReliable ? `${Math.round(mostReliable.value * 100)}% of shipments hit an exception` : '—'}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[12px] text-slate-500">
              <th scope="col" className="px-5 py-2.5 font-medium">Courier</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Score</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Speed</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Typical freight</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Charges</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {ranking.map((r) => (
              <tr key={r.carrierCode}>
                <th scope="row" className="px-5 py-3 text-left font-medium text-slate-900">
                  {r.carrierName}
                  {r.evidence < 2 && (
                    <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-500" title="Speed or freight couldn't be measured - the score leans on what could">
                      {r.evidence === 0 ? 'not enough data' : 'limited data'}
                    </span>
                  )}
                </th>
                <td className="px-3 py-3 text-right">
                  <span className={clsx('font-semibold', r.score >= 70 ? 'text-emerald-700' : r.score >= 50 ? 'text-slate-800' : 'text-red-700')}>{r.score}</span>
                </td>
                <td className="px-3 py-3 text-slate-700">{speedText(r.speedIndex)}</td>
                <td className="px-3 py-3 text-right text-slate-800">{inr(r.medianFreight)}</td>
                <td className="px-5 py-3">
                  {!r.costKnown ? (
                    <span className="text-slate-400">too little freight data</span>
                  ) : (
                    <span className={clsx('font-medium', r.cost >= 67 ? 'text-emerald-700' : r.cost >= 34 ? 'text-amber-700' : 'text-red-700')}>
                      {r.cost >= 67 ? 'Affordable' : r.cost >= 34 ? 'Mid-range' : 'Expensive'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {byState.length > 0 && (
        <div className="border-t border-slate-200 px-5 py-4">
          <h3 className="text-[13px] font-semibold text-slate-900">Best courier by destination</h3>
          <p className="mt-0.5 text-[12px] text-slate-500">Where at least two couriers have delivered: fewest problems, then fastest.</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {byState.map((lane) => (
              <li key={lane.state} className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-[13px]">
                  <span className="font-medium text-slate-900">{lane.state}</span>
                  <span className="text-slate-400"> → </span>
                  <span className="font-semibold text-brand-800">{lane.recommended.carrierName}</span>
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {lane.options
                    .map((o) => `${o.carrierName} ${o.shipments}× · ${days(o.averageTransitHours)}${o.medianFreight != null ? ` · ${inr(o.medianFreight)}` : ''}`)
                    .join('  |  ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
        Freight is known for {freightCoverage.withFreight} of {freightCoverage.shipments} shipments - from the invoice’s shipping charge and freight / courier
        lines in Zoho Books, and the master sheet. More fills in as the invoice history is read each night.
      </p>
    </section>
  );
}

function Pick({ label, name, detail, strong }: { label: string; name?: string; detail: string; strong?: boolean }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[12px] text-slate-500">{label}</p>
      <p className={clsx('mt-1 truncate font-semibold', strong ? 'text-[18px] text-brand-800' : 'text-[15px] text-slate-900')}>{name || '—'}</p>
      <p className="mt-0.5 text-[12px] text-slate-500">{detail}</p>
    </div>
  );
}
