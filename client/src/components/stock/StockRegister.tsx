import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import clsx from 'clsx';
import { useLedgerApi } from '../../hooks/useStock';
import { DownloadCsvButton } from '../DownloadCsvButton';
import type { StockMovement } from '../../types/stock';
import { oldNewText } from '../../utils/stock';

const when = (d: string) => format(new Date(d), 'EEE, d MMM yyyy · h:mm a');

/** "15 FRX added in stock", "4 FRX out to Site A" - the line as the team would say it. */
function sentence(m: StockMovement, dir: 'in' | 'out') {
  const n = Math.abs(m.change);
  if (dir === 'in') {
    const how = m.reason === 'created' ? 'added in stock (new item)' : m.reason === 'zoho' ? 'added in stock (Zoho Books)' : 'added in stock';
    return { n, how, party: m.customer ? `from ${m.customer}` : '' };
  }
  const how = m.reason === 'shipment' ? 'out with a shipment' : m.reason === 'zoho' ? 'out (Zoho Books invoice)' : m.reason === 'count' ? 'reduced at a count' : 'out of stock';
  return { n, how, party: m.customer ? `to ${m.customer}` : '' };
}

function Column({ dir }: { dir: 'in' | 'out' }) {
  const { ledger, api } = useLedgerApi();
  const { data: movements = [], isLoading } = useQuery({
    queryKey: [ledger.key, 'movements', dir],
    queryFn: () => api.movements(200, dir),
    refetchInterval: 60_000,
  });

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
          <span aria-hidden className={clsx('h-2 w-2 rounded-full', dir === 'in' ? 'bg-emerald-500' : 'bg-red-500')} />
          {dir === 'in' ? 'Stock in' : 'Stock out'}
          <span className="font-normal tabular-nums text-slate-500">{movements.length}</span>
        </h3>
        <DownloadCsvButton
          name={`stock-${dir}${ledger.kind === 'manual' ? '-manual' : ''}`}
          headers={['Date', 'Day', 'Time', 'Item', 'Quantity', 'Old', 'New', 'What', dir === 'in' ? 'From' : 'To', 'By', 'Stock after', 'Note']}
          rows={movements.map((m) => {
            const s = sentence(m, dir);
            return [
              format(new Date(m.createdAt), 'yyyy-MM-dd'),
              format(new Date(m.createdAt), 'EEEE'),
              format(new Date(m.createdAt), 'HH:mm'),
              m.itemName,
              s.n,
              m.oldChange == null ? '' : Math.abs(m.oldChange),
              m.newChange == null ? '' : Math.abs(m.newChange),
              s.how,
              m.customer || '',
              m.userName || '',
              m.quantityAfter,
              m.note || '',
            ];
          })}
        />
      </div>
      {isLoading ? (
        <div className="space-y-3 p-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 shimmer rounded bg-slate-100" />
          ))}
        </div>
      ) : movements.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-slate-500">{dir === 'in' ? 'Nothing has come in yet.' : 'Nothing has gone out yet.'}</p>
      ) : (
        <ol className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
          {movements.map((m) => {
            const s = sentence(m, dir);
            return (
              <li key={m._id} className="px-4 py-2.5 text-[13px]">
                <p className="text-slate-800">
                  <span className={clsx('font-semibold tabular-nums', dir === 'in' ? 'text-emerald-700' : 'text-red-700')}>{s.n}</span>{' '}
                  <span className="font-medium">{m.itemName}</span> <span className="text-slate-500">{s.how}</span>
                  {s.party && <span className="text-slate-700"> {s.party}</span>}
                  {oldNewText(m) && <span className={clsx('font-medium', dir === 'in' ? 'text-emerald-700' : 'text-red-700')}> · {oldNewText(m)}</span>}
                  <span className="text-slate-400"> · now {m.quantityAfter}</span>
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {when(m.createdAt)}
                  {m.userName && <span className="font-medium text-slate-700"> · by {m.userName}</span>}
                </p>
                {m.note && <p className="mt-0.5 text-[12px] text-slate-400">{m.note}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/**
 * The stock register: every addition and every removal as its own dated entry - what,
 * how many, day and date, and who - side by side, and downloadable.
 */
export function StockRegister() {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-slate-950">Stock register</h2>
        <p className="mt-0.5 text-[12px] text-slate-500">Every item added and taken out, with the day, date and who did it - newest first.</p>
      </div>
      <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
        <Column dir="in" />
        <Column dir="out" />
      </div>
    </section>
  );
}
