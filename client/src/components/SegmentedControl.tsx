import clsx from 'clsx';

export interface Segment<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Tailwind bg-* class for a leading dot that ties the option to its badge colour. */
  dot?: string;
}

/**
 * One question, one answer: "which stage?". Every option stays put even at zero so the
 * control never reflows under the pointer; empty options are dimmed, not hidden.
 */
export function SegmentedControl<T extends string>({
  label,
  segments,
  value,
  onChange,
}: {
  label: string;
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
      {segments.map((segment) => {
        const checked = segment.value === value;
        const empty = segment.count === 0 && !checked;
        return (
          <button
            key={segment.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(segment.value)}
            className={clsx(
              'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
              checked
                ? 'bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.06)]'
                : empty
                  ? 'text-slate-400 hover:text-slate-600'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-950'
            )}
          >
            {segment.dot && (
              <span aria-hidden className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', segment.dot, empty && 'opacity-40')} />
            )}
            {segment.label}
            {segment.count !== undefined && (
              <span className={clsx('tabular-nums', checked ? 'text-slate-500' : empty ? 'text-slate-300' : 'text-slate-400')}>
                {segment.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
