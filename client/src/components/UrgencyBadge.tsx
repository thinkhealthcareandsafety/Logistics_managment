import clsx from 'clsx';
import type { Shipment } from '../types/shipment';
import { daysLate, getUrgency } from '../utils/urgency';

/**
 * Plain coloured text rather than a filled chip: it sits under a date in dense rows,
 * and a column of shouting uppercase boxes drowns out the one that actually matters.
 */
export function UrgencyBadge({ shipment, className }: { shipment: Shipment; className?: string }) {
  const urgency = getUrgency(shipment);
  if (urgency === 'none') return null;

  const late = daysLate(shipment);
  const label =
    urgency === 'late'
      ? `${late} day${late === 1 ? '' : 's'} late`
      : urgency === 'today'
        ? 'Due today'
        : 'Due tomorrow';

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 text-[12px] font-medium',
        urgency === 'late' && 'text-red-600',
        urgency === 'today' && 'text-amber-700',
        urgency === 'tomorrow' && 'text-slate-500',
        className
      )}
    >
      {urgency !== 'tomorrow' && (
        <span
          aria-hidden
          className={clsx('h-1.5 w-1.5 rounded-full', urgency === 'late' ? 'bg-red-500' : 'bg-amber-500')}
        />
      )}
      {label}
    </span>
  );
}
