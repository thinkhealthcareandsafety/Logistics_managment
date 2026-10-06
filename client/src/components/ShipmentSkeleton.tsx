export function ShipmentSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="h-3.5 w-28 animate-pulse rounded bg-slate-200" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="mt-4 h-3.5 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-100" />
          <div className="mt-4 h-1.5 animate-pulse rounded-full bg-slate-100" />
          <div className="mt-4 flex justify-between border-t border-slate-100 pt-3">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ShipmentSkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-slate-100" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 px-4 py-4">
          <div className="h-4 w-4 animate-pulse rounded bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="hidden h-3.5 w-36 animate-pulse rounded bg-slate-100 lg:block" />
          <div className="h-5 w-24 animate-pulse rounded-full bg-slate-100" />
          <div className="hidden h-3.5 w-20 animate-pulse rounded bg-slate-100 sm:block" />
        </div>
      ))}
    </div>
  );
}
