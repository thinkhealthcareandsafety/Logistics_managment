import clsx from 'clsx';
import { format } from 'date-fns';
import type { Checkpoint } from '../types/shipment';
import { STATUS_LABELS, STATUS_STYLES } from '../utils/status';

export function Timeline({ checkpoints }: { checkpoints: Checkpoint[] }) {
  if (checkpoints.length === 0) {
    return <p className="text-sm text-slate-500">No checkpoint history yet. Check back after the next tracking update.</p>;
  }

  const ordered = [...checkpoints].reverse();

  return (
    <ol className="relative ml-2 space-y-6 border-l-2 border-slate-200 pl-6">
      {ordered.map((checkpoint, idx) => {
        const style = STATUS_STYLES[checkpoint.status];
        return (
          <li key={`${checkpoint.checkpointTime}-${idx}`} className="relative">
            <span
              className={clsx(
                'absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ring-2',
                style.dot,
                idx === 0 ? 'ring-brand-200' : 'ring-transparent'
              )}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className={clsx('text-sm font-semibold', style.text)}>{STATUS_LABELS[checkpoint.status]}</p>
              <p className="text-xs text-slate-400">{format(new Date(checkpoint.checkpointTime), 'MMM d, yyyy · h:mm a')}</p>
            </div>
            {checkpoint.location && <p className="text-sm text-slate-600">{checkpoint.location}</p>}
            {checkpoint.description && <p className="text-sm text-slate-500">{checkpoint.description}</p>}
          </li>
        );
      })}
    </ol>
  );
}
