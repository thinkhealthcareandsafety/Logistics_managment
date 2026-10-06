import clsx from 'clsx';

/**
 * "01 — How it works". A mono index and a hairline instead of the uppercase,
 * letter-spaced eyebrow every template reaches for.
 */
export function SectionMark({ index, label, dark }: { index: string; label: string; dark?: boolean }) {
  return (
    <p className="flex items-center gap-3 text-[13px] font-medium">
      <span className={clsx('font-mono', dark ? 'text-brand-300/70' : 'text-slate-400')}>{index}</span>
      <span aria-hidden className={clsx('h-px w-6', dark ? 'bg-white/20' : 'bg-slate-300')} />
      <span className={dark ? 'text-brand-100' : 'text-slate-900'}>{label}</span>
    </p>
  );
}
