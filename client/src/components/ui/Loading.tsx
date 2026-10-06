import clsx from 'clsx';

/**
 * The app's loading vocabulary, used everywhere so waiting looks the same on every
 * screen:
 *   Spinner   - inside a button or next to text while an action runs
 *   Skeleton  - the shape of content that's still loading (no layout jump when it lands)
 *   PageLoader - full screen, only while the session itself is being checked
 * All of them respect reduced-motion and announce themselves to screen readers once.
 */

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className={clsx('h-4 w-4 shrink-0 animate-spin motion-reduce:animate-[spin_1.6s_linear_infinite]', className)}
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && (
        <span role="status" className="sr-only">
          {label}
        </span>
      )}
    </>
  );
}

/** A grey placeholder block. Size and shape come from className (h-*, w-*, rounded-*). */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div aria-hidden style={style} className={clsx('animate-pulse rounded-md bg-slate-200/70 motion-reduce:animate-none', className)} />
  );
}

/** Wraps a skeleton region: one polite "Loading …" for assistive tech, busy state on the region. */
export function SkeletonRegion({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Full-screen loader with the brand mark - shown while the saved session is checked. */
export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-900 text-base font-bold text-white">TH</span>
      <span className="flex items-center gap-2 text-[13px] text-slate-500">
        <Spinner className="h-3.5 w-3.5 text-brand-700" />
        {label}…
      </span>
    </div>
  );
}

/** Generic in-app page placeholder: title, a metric strip and two content blocks. */
export function PageSkeleton({ label = 'Loading page' }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3.5 w-72" />
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
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </SkeletonRegion>
  );
}
