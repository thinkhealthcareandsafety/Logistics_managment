import clsx from 'clsx';

/** Page numbers to show: first, last, and a window around the current one, with gaps. */
function pageList(page: number, pages: number, around: number): (number | 'gap')[] {
  const out: (number | 'gap')[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= around) out.push(p);
    else if (out[out.length - 1] !== 'gap') out.push('gap');
  }
  return out;
}

/**
 * "1–50 of 838" with previous / numbered pages / next. `compact` is the narrow version
 * for board columns: fewer numbers, smaller buttons.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  compact = false,
  label = 'Pages',
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  compact?: boolean;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = clsx(
    'inline-flex items-center justify-center rounded-md font-medium tabular-nums transition disabled:cursor-not-allowed disabled:opacity-40',
    compact ? 'h-6 min-w-6 px-1.5 text-[11px]' : 'h-8 min-w-8 px-2 text-[13px]'
  );

  return (
    <nav aria-label={label} className={clsx('flex flex-wrap items-center justify-between gap-2', compact ? 'text-[11px]' : 'text-[12px]')}>
      <span className="tabular-nums text-slate-500">
        <span className="font-semibold text-slate-800">
          {from}–{to}
        </span>{' '}
        of {total.toLocaleString('en-IN')}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-0.5">
          <button type="button" className={clsx(btn, 'text-slate-600 hover:bg-slate-100')} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            ‹{!compact && <span className="ml-1">Prev</span>}
          </button>
          {pageList(page, pages, compact ? 0 : 1).map((p, i) =>
            p === 'gap' ? (
              <span key={`g${i}`} className="px-1 text-slate-400" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={clsx(btn, p === page ? 'bg-brand-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
              >
                {p}
              </button>
            )
          )}
          <button type="button" className={clsx(btn, 'text-slate-600 hover:bg-slate-100')} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
            {!compact && <span className="mr-1">Next</span>}›
          </button>
        </div>
      )}
    </nav>
  );
}
