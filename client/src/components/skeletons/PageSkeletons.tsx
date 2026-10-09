import { useLocation } from 'react-router-dom';
import { PageSkeleton, Skeleton, SkeletonRegion } from '../ui/Loading';
import { ShipmentSkeletonRows } from '../ShipmentSkeleton';

/**
 * Whole-page skeletons, one per signed-in page. Each page shows its own skeleton while
 * its data loads, and Layout shows the same one while the page's code downloads - so
 * opening a page goes skeleton -> content, never generic skeleton -> page skeleton ->
 * content.
 */

/** Shipments dashboard: header, four summary tiles, the shipments panel. */
export function DashboardSkeleton() {
  return (
    <SkeletonRegion label="Loading shipments" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 bg-white px-5 py-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 pb-3 pt-4 lg:flex-row lg:items-center lg:justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-full max-w-[520px] rounded-lg" />
        </div>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Skeleton className="h-8 w-72 max-w-full rounded-lg" />
          <Skeleton className="ml-auto hidden h-8 w-48 rounded-lg sm:block" />
        </div>
        <ShipmentSkeletonRows />
      </div>
    </SkeletonRegion>
  );
}

export function StockSkeleton() {
  return (
    <SkeletonRegion label="Loading stock" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 bg-white px-5 py-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-72 max-w-full rounded-lg" />
        <Skeleton className="hidden h-8 w-80 rounded-lg sm:block" />
      </div>
      {[4, 3].map((rows, c) => (
        <div key={c} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: rows }).map((_, r) => (
              <div key={r} className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5" style={{ width: `${30 + ((r * 13 + c * 7) % 30)}%` }} />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-8 w-28 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Analytics header (title + date range) above the body skeleton. */
export function AnalyticsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4" aria-hidden>
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-8 w-96 max-w-full rounded-lg" />
      </div>
      <AnalyticsSkeleton />
    </div>
  );
}

/** The page's shape while the first numbers load: metric strip, two charts, the courier table. */
export function AnalyticsSkeleton() {
  const card = 'rounded-xl border border-slate-200 bg-white p-5';
  return (
    <SkeletonRegion label="Loading analytics" className="space-y-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 bg-white px-5 py-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className={card}>
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-2 h-3 w-64" />
        <div className="mt-6 flex h-40 items-end gap-3 sm:gap-6">
          {[55, 80, 45, 95, 70, 35, 25].map((h, i) => (
            <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <div className={card}>
        <Skeleton className="h-4 w-36" />
        <div className="mt-5 space-y-3">
          {[90, 72, 60, 48, 35].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className={card}>
        <Skeleton className="h-4 w-40" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}

export function DetailSkeleton() {
  return (
    <SkeletonRegion label="Loading shipment" className="space-y-6">
      <Skeleton className="h-3.5 w-48" />
      {/* Header: AWB + status, courier line, actions, progress rail, four facts */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </div>
        <div className="border-t border-slate-100 px-5 pb-5 pt-5 sm:px-6">
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="mt-3 flex justify-between">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 bg-white px-5 py-4 sm:px-6">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tracking history */}
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <Skeleton className="h-4 w-36" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="mt-0.5 h-3 w-3 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
        {/* Side cards */}
        <div className="space-y-6">
          {[4, 3].map((rows, c) => (
            <div key={c} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
              <Skeleton className="h-4 w-28" />
              {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** Notification settings: title, then two sections of toggle rows. */
export function SettingsSkeleton() {
  return (
    <SkeletonRegion label="Loading notification settings" className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      {[3, 5].map((rows, s) => (
        <div key={s} className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 lg:grid-cols-3 lg:gap-10">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white lg:col-span-2">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Profile: title, account card, two short sections. */
export function ProfileSkeleton() {
  return (
    <SkeletonRegion label="Loading profile" className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 lg:grid-cols-3 lg:gap-10">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white lg:col-span-2">
          <div className="flex items-center gap-4 p-5">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52" />
            </div>
          </div>
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between gap-3 px-5 py-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-36" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** The skeleton of whichever signed-in page is being opened. */
export function RouteSkeleton() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/dashboard')) return <DashboardSkeleton />;
  if (pathname.startsWith('/stock')) return <StockSkeleton />;
  if (pathname.startsWith('/analytics')) return <AnalyticsPageSkeleton />;
  if (pathname.startsWith('/shipments/')) return <DetailSkeleton />;
  if (pathname.startsWith('/settings')) return <SettingsSkeleton />;
  if (pathname.startsWith('/profile')) return <ProfileSkeleton />;
  return <PageSkeleton />;
}
