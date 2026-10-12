import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { stockApi } from '../../api/stock';
import { Skeleton, SkeletonRegion } from '../ui/Loading';

/**
 * Goods that came in - purchases recorded in Zoho Books (bills from any vendor),
 * new products, and counts that went up. Newest first; refreshes itself.
 */
export function StockInPanel() {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['stock', 'movements', 'in'],
    queryFn: () => stockApi.movements(25, 'in'),
    refetchInterval: 60_000,
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-950">
          <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500" />
          Stock in
        </h2>
        <span className="hidden text-[12px] text-slate-400 sm:inline">Purchases from vendors via Zoho Books, newest first</span>
      </div>
      {isLoading ? (
        <SkeletonRegion label="Loading stock in" className="divide-y divide-slate-100">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-5 w-12 rounded-md" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </SkeletonRegion>
      ) : movements.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-slate-500">
          No stock has come in yet. Purchases recorded in Zoho Books appear here automatically.
        </p>
      ) : (
        <ol className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
          {movements.map((m) => (
            <li key={m._id} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
              <span className="mt-0.5 shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-emerald-700">+{m.change}</span>
              <div className="min-w-0 flex-1">
                <p className="text-slate-800">
                  <span className="font-medium">{m.itemName}</span>
                  {m.customer && <span className="text-slate-500"> from {m.customer}</span>}
                  <span className="text-slate-400"> · now {m.quantityAfter}</span>
                </p>
                {m.note && <p className="mt-0.5 text-[12px] text-slate-500">{m.note}</p>}
              </div>
              <span className="shrink-0 text-[12px] text-slate-400">{formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
