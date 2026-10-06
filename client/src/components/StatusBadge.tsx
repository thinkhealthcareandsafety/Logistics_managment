import clsx from 'clsx';
import type { ShipmentStatus } from '../types/shipment';
import { STATUS_LABELS, STATUS_STYLES } from '../utils/status';

/**
 * `dot` is the default: a coloured dot + plain label. In a dense list, a wall of
 * filled pills reads as noise - the dot carries the same signal at a fraction of
 * the visual weight. `pill` is for the one place a status is the headline (detail page).
 */
export function StatusBadge({
  status,
  variant = 'dot',
  className,
}: {
  status: ShipmentStatus;
  variant?: 'dot' | 'pill';
  className?: string;
}) {
  const style = STATUS_STYLES[status];

  if (variant === 'pill') {
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          style.bg,
          style.text,
          className
        )}
      >
        <span className={clsx('h-1.5 w-1.5 rounded-full', style.dot)} />
        {STATUS_LABELS[status]}
      </span>
    );
  }

  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-[13px] font-medium', style.text, className)}>
      <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}
