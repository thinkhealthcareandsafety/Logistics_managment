import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

/**
 * A customer with an AWB shouldn't need an account, a link from us, or even to know
 * what a tracking page is - they type the number and land on the same public
 * /track/:trackingNumber page we hand out in notifications.
 */
export function TrackLookup({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const awb = value.trim();
    if (!awb) return;
    navigate(`/track/${encodeURIComponent(awb)}`);
  }

  const isLarge = size === 'lg';

  return (
    <form
      onSubmit={handleSubmit}
      className={clsx(
        'flex w-full items-center gap-2 rounded-full bg-white ring-1 ring-slate-900/[0.1] transition',
        'shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-within:ring-2 focus-within:ring-brand-500',
        isLarge ? 'p-1.5' : 'p-1'
      )}
    >
      <label htmlFor="awb" className="sr-only">
        Tracking number
      </label>
      <svg className="ml-3 shrink-0 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        id="awb"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter a tracking number"
        autoComplete="off"
        spellCheck={false}
        className={clsx(
          'min-w-0 flex-1 bg-transparent font-mono text-slate-950 placeholder:font-sans placeholder:text-slate-400 focus:outline-none',
          isLarge ? 'py-2.5 text-[15px]' : 'py-2 text-[14px]'
        )}
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className={clsx(
          'shrink-0 rounded-full bg-slate-950 font-medium text-white transition hover:bg-brand-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400',
          isLarge ? 'px-6 py-2.5 text-[14px]' : 'px-5 py-2 text-[13.5px]'
        )}
      >
        Track
      </button>
    </form>
  );
}
