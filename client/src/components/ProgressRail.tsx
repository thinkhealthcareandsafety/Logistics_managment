import clsx from 'clsx';
import { DELIVERY_STEPS, STATUS_LABELS } from '../utils/status';
import type { ShipmentStatus } from '../types/shipment';

/**
 * Four-segment delivery rail. Shared by the dashboard cards and the shipment detail
 * page so "how far along is this" reads the same everywhere.
 *
 * An `exception` shipment gets a single red bar rather than a position on the rail -
 * a stuck parcel isn't "60% delivered", and drawing it that way would be a lie.
 */
export function ProgressRail({
  status,
  className,
  showLabels = false,
}: {
  status: ShipmentStatus;
  className?: string;
  showLabels?: boolean;
}) {
  if (status === 'exception') {
    return (
      <div className={clsx('flex items-center gap-2', className)}>
        <span className="h-1.5 flex-1 rounded-full bg-red-500" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-red-600">Held up</span>
      </div>
    );
  }

  const current = DELIVERY_STEPS.indexOf(status);

  return (
    <ol className={clsx('grid grid-cols-4 gap-1', className)} aria-label={`Progress: ${STATUS_LABELS[status]}`}>
      {DELIVERY_STEPS.map((step, idx) => (
        <li key={step}>
          <span
            aria-hidden
            className={clsx(
              'block h-1.5 rounded-full transition-colors',
              idx < current && 'bg-brand-500',
              idx === current && 'bg-brand-700',
              idx > current && 'bg-slate-200'
            )}
          />
          {showLabels && (
            <span
              className={clsx(
                'mt-1.5 block text-[11px] font-medium',
                idx <= current ? 'text-slate-700' : 'text-slate-400'
              )}
            >
              {STATUS_LABELS[step]}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
