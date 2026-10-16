import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import clsx from 'clsx';
import { analyticsApi, type ReorderPrediction } from '../../api/analytics';
import { SegmentedControl } from '../SegmentedControl';
import { DownloadCsvButton } from '../DownloadCsvButton';
import { Spinner } from '../ui/Loading';

type View = 'soon' | 'overdue' | 'all' | 'lapsed';

const when = (p: ReorderPrediction) =>
  p.daysUntil === 0 ? 'today' : p.daysUntil > 0 ? `in ${p.daysUntil} day${p.daysUntil === 1 ? '' : 's'}` : `${-p.daysUntil} day${p.daysUntil === -1 ? '' : 's'} late`;
const qty = (n: number) => (Number.isInteger(n) ? n : n.toFixed(1)).toLocaleString();
const rhythm = (d: number) => (d >= 26 && d <= 35 ? 'monthly' : d >= 12 && d <= 17 ? 'fortnightly' : d >= 6 && d <= 8 ? 'weekly' : `every ${d} days`);

const CONFIDENCE = {
  high: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  medium: 'bg-amber-50 text-amber-800 ring-amber-200',
  low: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/**
 * Who should be ordering again, and when: each client + item bought on a rhythm (three
 * or more orders), its usual quantity and gap, and the next order it points to. Plus
 * what that means for stock over the next 30 days.
 */
export function ReorderPredictions() {
  const { data, isLoading } = useQuery({ queryKey: ['analytics', 'reorders'], queryFn: analyticsApi.reorders, refetchInterval: 10 * 60_000 });
  const [view, setView] = useState<View>('soon');

  const counts = useMemo(() => {
    const p = data?.predictions || [];
    return {
      soon: p.filter((x) => x.status === 'due' || (x.status === 'upcoming' && x.daysUntil <= 30)).length,
      overdue: p.filter((x) => x.status === 'overdue').length,
      lapsed: p.filter((x) => x.status === 'lapsed').length,
      all: p.filter((x) => x.status !== 'lapsed').length,
    };
  }, [data]);

  const rows = useMemo(() => {
    const p = data?.predictions || [];
    if (view === 'soon') return p.filter((x) => x.status === 'due' || (x.status === 'upcoming' && x.daysUntil <= 30));
    if (view === 'overdue') return p.filter((x) => x.status === 'overdue');
    if (view === 'lapsed') return p.filter((x) => x.status === 'lapsed');
    return p.filter((x) => x.status !== 'lapsed');
  }, [data, view]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-950">Reorder predictions</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">Clients who buy the same item on a rhythm - when their next order should come, and how much.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<View>
            label="Show"
            value={view}
            onChange={setView}
            segments={[
              { value: 'soon', label: 'Due in 30 days', count: counts.soon },
              { value: 'overdue', label: 'Overdue', count: counts.overdue, dot: 'bg-red-500' },
              { value: 'all', label: 'All', count: counts.all },
              { value: 'lapsed', label: 'Stopped ordering', count: counts.lapsed },
            ]}
          />
          <DownloadCsvButton
            name="reorder-predictions"
            headers={['Client', 'Item', 'Orders so far', 'Usual quantity', 'Recent quantity', 'Every (days)', 'Per month', 'Last order', 'Next expected', 'Days until (negative = late)', 'Status', 'Confidence']}
            rows={rows.map((p) => [
              p.customer,
              p.item,
              p.orders,
              p.typicalQty,
              p.recentQty,
              p.everyDays,
              p.perMonth ?? '',
              format(new Date(p.lastOrderAt), 'yyyy-MM-dd'),
              format(new Date(p.nextOrderAt), 'yyyy-MM-dd'),
              p.daysUntil,
              p.status,
              p.confidence,
            ])}
          />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="p-5">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50/70 text-[12px] text-slate-500">
                  <th scope="col" className="px-5 py-2.5 font-medium">Client · item</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Usually buys</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Last order</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Next order</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                      {data.predictions.length === 0
                        ? 'No repeat buying patterns found yet - a client needs 3 or more orders of the same item.'
                        : 'Nothing in this view.'}
                    </td>
                  </tr>
                )}
                {rows.map((p) => (
                  <tr key={`${p.customer}|${p.item}`}>
                    <th scope="row" className="px-5 py-3 text-left font-normal">
                      <span className="block font-medium text-slate-900">{p.customer}</span>
                      <span className="block text-[12px] text-slate-500">{p.item}</span>
                    </th>
                    <td className="px-3 py-3 tabular-nums text-slate-800">
                      ~{qty(p.recentQty || p.typicalQty)} {rhythm(p.everyDays)}
                      <span className="block text-[12px] text-slate-500">
                        {p.orders} orders{p.perMonth != null ? ` · ~${qty(p.perMonth)} a month` : ''}
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-slate-700">{format(new Date(p.lastOrderAt), 'd MMM yyyy')}</td>
                    <td className="px-3 py-3 tabular-nums">
                      <span className="text-slate-900">{format(new Date(p.nextOrderAt), 'd MMM yyyy')}</span>
                      <span
                        className={clsx(
                          'block text-[12px] font-medium',
                          p.status === 'overdue' || p.status === 'lapsed' ? 'text-red-700' : p.status === 'due' ? 'text-amber-700' : 'text-slate-500'
                        )}
                      >
                        {p.status === 'lapsed' ? `${-p.daysUntil} days late - may have stopped` : when(p)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={clsx('rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset', CONFIDENCE[p.confidence])}>{p.confidence}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.demand.length > 0 && (
            <div className="border-t border-slate-200 px-5 py-4">
              <h3 className="text-[13px] font-semibold text-slate-900">Expected demand, next 30 days</h3>
              <p className="mt-0.5 text-[12px] text-slate-500">What the predicted orders add up to, next to the stock on hand.</p>
              <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {data.demand.slice(0, 15).map((d) => (
                  <li key={d.itemId || d.item} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-slate-900">{d.item}</span>
                    <span className="shrink-0 tabular-nums text-slate-700">
                      ~{d.expectedQty} from {d.clients} client{d.clients === 1 ? '' : 's'}
                      {d.inStock != null && (
                        <span className={clsx('ml-2 font-medium', d.short ? 'text-red-700' : 'text-emerald-700')}>
                          {d.short ? `only ${d.inStock} in stock` : `${d.inStock} in stock`}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
            {data.source === 'invoices'
              ? `Read from ${data.history.cached} Zoho Books invoices (client, item, quantity and date).`
              : `Read from shipments for now. Zoho Books invoices give cleaner patterns - their history is read a little each night (${data.history.cached}${data.history.listed ? ` of ${data.history.listed}` : ''} so far), then predictions switch to them.`}{' '}
            A pattern needs 3+ orders of the same item; confidence is how steady the gaps between orders are.
          </p>
        </>
      )}
    </section>
  );
}
