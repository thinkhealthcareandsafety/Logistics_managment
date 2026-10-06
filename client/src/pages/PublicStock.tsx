import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { stockApi } from '../api/stock';
import { expiryState, formatExpiry, listPrefix, whatsappShareUrl } from '../utils/stock';

/**
 * The page behind the link pinned in the logistics WhatsApp group. Read-only and
 * always current - it refetches on focus and every minute, so reopening the link is
 * the whole workflow.
 */
export function PublicStock() {
  const { token = '' } = useParams<{ token: string }>();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['public-stock', token],
    queryFn: () => stockApi.publicStock(token),
    refetchInterval: 60_000,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-900 text-[13px] font-bold text-white">TH</span>
            <span className="leading-tight">
              <span className="block text-[14px] font-semibold text-slate-900">Stock available</span>
              <span className="block text-[11px] text-slate-500">ThinkHealth Logistics · internal</span>
            </span>
          </div>
          {data && (
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <svg className={clsx(isFetching && 'animate-spin')} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
                <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Refresh
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {isLoading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-white ring-1 ring-slate-200" />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-xl bg-white px-6 py-14 text-center ring-1 ring-slate-200">
            <p className="text-sm font-semibold text-slate-900">This stock link doesn’t work any more</p>
            <p className="mt-1 text-[13px] text-slate-500">It may have been replaced. Ask the logistics team for the new one.</p>
          </div>
        )}

        {data && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-slate-500">
                Counted {format(new Date(data.updatedAt), 'd MMM, h:mm a')} ·{' '}
                {formatDistanceToNow(new Date(data.updatedAt), { addSuffix: true })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(data.message).then(
                      () => toast.success('Stock message copied'),
                      () => toast.error('Could not copy')
                    )
                  }
                  className="h-8 rounded-lg bg-white px-2.5 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
                >
                  Copy as message
                </button>
                <a
                  href={whatsappShareUrl(data.message)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center rounded-lg bg-[#1f9d55] px-2.5 text-[13px] font-semibold text-white transition hover:bg-[#188046]"
                >
                  Share on WhatsApp
                </a>
              </div>
            </div>

            {data.categories.map((category) => {
              const total = category.items.reduce((sum, i) => sum + i.quantity, 0);
              return (
                <section key={category.id} className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                  <div className="flex items-baseline justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                    <h2 className="text-[14px] font-semibold text-slate-950">{category.name}</h2>
                    <span className="text-[13px] tabular-nums text-slate-500">{total} units</span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {category.items.map((item, idx) => (
                      <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
                        <div className="min-w-0 text-[14px]">
                          <span className="text-slate-900">
                            {category.listStyle !== 'plain' && (
                              <span className="mr-1.5 text-slate-400">{listPrefix(category.listStyle, idx)}</span>
                            )}
                            {item.name}
                          </span>
                          {item.size && (
                            <span className="ml-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[12px] font-medium text-slate-700">
                              {item.size}
                            </span>
                          )}
                          {item.note && <span className="text-slate-500"> ({item.note})</span>}
                          {item.oldQuantity != null && (
                            <span className="mt-0.5 block text-[12px] text-slate-500">
                              {item.oldQuantity} old + {item.quantity - item.oldQuantity} new
                            </span>
                          )}
                          {item.expiryDates.length > 0 && (
                            <span className="mt-1 flex flex-wrap gap-1.5">
                              {item.expiryDates.map((d) => (
                                <span
                                  key={d}
                                  className={clsx(
                                    'rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                                    expiryState(d) === 'ok'
                                      ? 'bg-slate-50 text-slate-600 ring-slate-200'
                                      : 'bg-amber-50 text-amber-800 ring-amber-200'
                                  )}
                                >
                                  Exp {formatExpiry(d)}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                        <span
                          className={clsx(
                            'shrink-0 text-[16px] font-semibold tabular-nums',
                            item.quantity === 0 ? 'text-red-600' : 'text-slate-950'
                          )}
                        >
                          {item.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            <p className="pb-6 pt-2 text-center text-[12px] text-slate-400">
              Internal to ThinkHealth - please don’t forward this link outside the team.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
