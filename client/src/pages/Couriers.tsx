import clsx from 'clsx';
import { useAnalytics } from '../hooks/useAnalytics';
import { Spinner } from '../components/ui/Loading';
import { AnalyticsSkeleton } from '../components/skeletons/PageSkeletons';
import { DateRangeControl, useDateRange } from '../components/analytics/DateRange';
import { CourierAdvicePanel } from '../components/analytics/CourierAdvicePanel';
import { CourierComparison } from '../components/analytics/CourierComparison';

/**
 * Courier partners in one place: which to use (reliability, route-fair speed, freight),
 * whose charges are affordable, the best one per destination, and the full comparison.
 */
export function Couriers() {
  const dateRange = useDateRange();
  const { data, isLoading, isError, isPlaceholderData, refetch } = useAnalytics({ from: dateRange.from, to: dateRange.to });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-[24px] font-semibold tracking-[-0.02em] text-slate-950">
            Couriers
            {isPlaceholderData && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium tracking-normal text-slate-500">
                <Spinner className="h-3.5 w-3.5" label="Updating for the new date range" />
                Updating…
              </span>
            )}
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">Which courier partner to use - performance and freight charges, compared.</p>
        </div>
        <DateRangeControl state={dateRange} />
      </header>

      {isLoading && <AnalyticsSkeleton />}

      {isError && !data && (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-slate-900">Couldn’t load courier data</p>
          <button onClick={() => refetch()} className="btn-secondary mt-4 h-8 px-3 py-0 text-[13px]">
            Try again
          </button>
        </div>
      )}

      {data && (
        <div className={clsx('space-y-6 transition-opacity', isPlaceholderData && 'opacity-60')} aria-busy={isPlaceholderData}>
          {data.courierAdvice ? (
            <CourierAdvicePanel advice={data.courierAdvice} />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-[13px] text-slate-500">
              No recommendation in this range - a courier needs 5 or more shipments. Try a wider date range.
            </div>
          )}
          <CourierComparison rows={data.exceptionRateByCarrier} />
        </div>
      )}
    </div>
  );
}
