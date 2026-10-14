import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { Shipment, ShipmentStatus } from '../types/shipment';
import { deliveredOn, deliverTo } from '../utils/logistics';

type Column = Extract<ShipmentStatus, 'in_transit' | 'out_for_delivery' | 'delivered'>;

const COLUMNS: { status: Column; label: string; dot: string }[] = [
  { status: 'in_transit', label: 'In transit', dot: 'bg-sky-500' },
  { status: 'out_for_delivery', label: 'Out for delivery', dot: 'bg-amber-500' },
  { status: 'delivered', label: 'Delivered', dot: 'bg-emerald-500' },
];

/** How many cards a column draws before "Show more" - the delivered pile runs to hundreds. */
const PAGE = 40;

const titleCase = (v: string) => v.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
/** "YYYY-MM" in India time. */
const istMonth = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);
const monthLabel = (key: string) =>
  new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
const shortDate = (d: Date) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(d);

/**
 * Where the shipment is: the courier's latest scan while it travels; once delivered,
 * where it was delivered (the delivery scan's place, else the delivery address).
 */
function locationOf(s: Shipment): string {
  if (s.status === 'delivered') {
    const scan = [...(s.checkpoints || [])].reverse().find((c) => c.status === 'delivered' && c.location);
    return titleCase(scan?.location || '') || deliverTo(s).place;
  }
  return titleCase(s.currentLocation || '') || '';
}

/**
 * Three columns - in transit, out for delivery, delivered - each shipment with its
 * customer and where it is now. Delivered can be narrowed to one month.
 */
export function ShipmentBoard({ shipments }: { shipments: Shipment[] }) {
  const byStatus = useMemo(() => {
    const out: Record<Column, Shipment[]> = { in_transit: [], out_for_delivery: [], delivered: [] };
    for (const s of shipments) if (s.status in out) out[s.status as Column].push(s);
    const time = (s: Shipment) => new Date(s.lastCheckedAt || s.updatedAt || s.createdAt).getTime();
    out.in_transit.sort((a, b) => time(b) - time(a));
    out.out_for_delivery.sort((a, b) => time(b) - time(a));
    out.delivered.sort((a, b) => (deliveredOn(b)?.getTime() ?? 0) - (deliveredOn(a)?.getTime() ?? 0));
    return out;
  }, [shipments]);

  // Months that have deliveries, newest first, with their counts.
  const months = useMemo(() => {
    const m = new Map<string, number>();
    // A delivery dated in the future is a typo, not a month to pick (it stays under "All months").
    const now = Date.now();
    for (const s of byStatus.delivered) {
      const on = deliveredOn(s);
      if (on && on.getTime() <= now) m.set(istMonth(on), (m.get(istMonth(on)) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [byStatus.delivered]);

  const [month, setMonth] = useState<string>(''); // '' = the latest month with deliveries
  const chosenMonth = month || months[0]?.[0] || 'all';
  const delivered = useMemo(
    () => (chosenMonth === 'all' ? byStatus.delivered : byStatus.delivered.filter((s) => { const on = deliveredOn(s); return on && istMonth(on) === chosenMonth; })),
    [byStatus.delivered, chosenMonth]
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-slate-950">Shipment board</h2>
        <p className="mt-0.5 text-[13px] text-slate-500">Where each shipment is right now, by stage.</p>
      </div>
      <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
        {COLUMNS.map((col) => {
          const list = col.status === 'delivered' ? delivered : byStatus[col.status];
          return (
            <BoardColumn
              key={col.status}
              label={col.label}
              dot={col.dot}
              count={list.length}
              shipments={list}
              resetKey={col.status === 'delivered' ? chosenMonth : ''}
              control={
                col.status === 'delivered' && months.length > 0 ? (
                  <label className="relative">
                    <span className="sr-only">Delivered in month</span>
                    <select
                      value={chosenMonth}
                      onChange={(e) => setMonth(e.target.value)}
                      className="h-7 max-w-[11rem] cursor-pointer appearance-none rounded-md border border-slate-200 bg-white pl-2 pr-6 text-[12px] font-medium text-slate-700 outline-none hover:border-slate-300 focus:border-brand-500"
                    >
                      {months.map(([key, n]) => (
                        <option key={key} value={key}>
                          {monthLabel(key)} ({n})
                        </option>
                      ))}
                      <option value="all">All months ({byStatus.delivered.length})</option>
                    </select>
                    <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </label>
                ) : null
              }
            />
          );
        })}
      </div>
    </section>
  );
}

function BoardColumn({
  label,
  dot,
  count,
  shipments,
  control,
  resetKey,
}: {
  label: string;
  dot: string;
  count: number;
  shipments: Shipment[];
  control: ReactNode;
  resetKey: string;
}) {
  const [shown, setShown] = useState({ key: resetKey, n: PAGE });
  const limit = shown.key === resetKey ? shown.n : PAGE; // back to the first page when the month changes
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-2 bg-slate-50/70 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
          <span className={clsx('h-2 w-2 rounded-full', dot)} aria-hidden />
          {label}
          <span className="font-normal tabular-nums text-slate-500">{count}</span>
        </h3>
        {control}
      </div>
      <ul className="max-h-[420px] flex-1 divide-y divide-slate-100 overflow-y-auto">
        {shipments.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-slate-400">Nothing here</li>}
        {shipments.slice(0, limit).map((s) => {
          const where = locationOf(s);
          const on = s.status === 'delivered' ? deliveredOn(s) : null;
          return (
            <li key={s._id}>
              <Link to={`/shipments/${s._id}`} className="block px-4 py-2.5 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600">
                <p className="truncate text-[13px] font-medium text-slate-900">{s.customerInfo?.name || s.productDetails?.name || s.trackingNumber}</p>
                <p className={clsx('mt-0.5 flex items-center gap-1 truncate text-[12px]', where ? 'text-slate-600' : 'text-slate-400')}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" aria-hidden>
                    <path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <span className="truncate">{where || 'Location not reported yet'}</span>
                </p>
                <p className="mt-0.5 truncate text-[11px] tabular-nums text-slate-400">
                  {s.trackingNumber}
                  {s.carrierName ? ` · ${s.carrierName}` : ''}
                  {on ? ` · ${shortDate(on)}` : ''}
                </p>
              </Link>
            </li>
          );
        })}
        {shipments.length > limit && (
          <li className="px-4 py-2">
            <button
              type="button"
              onClick={() => setShown({ key: resetKey, n: limit + PAGE })}
              className="text-[12px] font-medium text-brand-700 hover:text-brand-900"
            >
              Show {Math.min(PAGE, shipments.length - limit)} more of {shipments.length - limit}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
