import { useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useCarriers } from '../hooks/useCarriers';
import { carriersApi } from '../api/carriers';
import type { Carrier } from '../types/shipment';

const MAX_RESULTS = 50;

export function CourierLogo({ courier, size = 18 }: { courier?: Pick<Carrier, 'name' | 'logo'> | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initials = (courier?.name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  if (!courier?.logo || broken) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.42) }}
        className="inline-flex shrink-0 items-center justify-center rounded bg-slate-100 font-semibold text-slate-500"
      >
        {initials}
      </span>
    );
  }
  return (
    <img
      src={courier.logo}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setBroken(true)}
      className="shrink-0 rounded bg-white object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function rank(c: Carrier, q: string) {
  const name = c.name.toLowerCase();
  const code = c.code.toLowerCase();
  if (name === q || code === q) return 0;
  if (name.startsWith(q) || code.startsWith(q)) return 1;
  if (name.split(/[\s-]+/).some((w) => w.startsWith(q))) return 2;
  if (name.includes(q) || code.includes(q)) return 3;
  return -1;
}

/**
 * Any courier in TrackingMore's catalog (~1,700). Indian couriers first - that's who
 * this team ships with - and well-known ones before those when nothing is typed.
 * An accessible combobox: type to filter, arrows to move, Enter to pick, Esc to close.
 */
export function CourierPicker({
  id,
  value,
  onChange,
  trackingNumber,
}: {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  /** Enables "Suggest from AWB". */
  trackingNumber?: string;
}) {
  const { data, byCode, isLoading, isError } = useCarriers();
  const reactId = useId();
  const inputId = id || `${reactId}-courier`;
  const listId = `${reactId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [suggestions, setSuggestions] = useState<{ state: 'idle' | 'loading' | 'done' | 'error'; list: Carrier[] }>({
    state: 'idle',
    list: [],
  });

  const selected = byCode.get(value) || null;
  const total = data?.carriers.length ?? 0;

  const results = useMemo(() => {
    const all = data?.carriers ?? [];
    const q = query.trim().toLowerCase();
    if (!q) {
      return (data?.featured ?? []).map((code) => byCode.get(code)).filter(Boolean) as Carrier[];
    }
    return all
      .map((c) => ({ c, r: rank(c, q) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || Number(b.c.country === 'IN') - Number(a.c.country === 'IN') || a.c.name.localeCompare(b.c.name))
      .slice(0, MAX_RESULTS)
      .map((x) => x.c);
  }, [data, byCode, query]);

  useEffect(() => setActiveIdx(0), [query, open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  });

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // A new AWB invalidates the old suggestions.
  useEffect(() => setSuggestions({ state: 'idle', list: [] }), [trackingNumber]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function pick(code: string) {
    onChange(code);
    close();
  }

  async function suggest() {
    if (!trackingNumber?.trim()) return;
    setSuggestions({ state: 'loading', list: [] });
    try {
      setSuggestions({ state: 'done', list: await carriersApi.detect(trackingNumber.trim()) });
    } catch {
      setSuggestions({ state: 'error', list: [] });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && results[activeIdx]) {
        e.preventDefault();
        pick(results[activeIdx].code);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        close();
      }
    }
  }

  const needs = selected?.requiredFields ?? [];
  const unsupported = needs.filter((f) => f === 'tracking_key' || f === 'tracking_account_number');

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
          {open ? (
            <svg className="text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
          ) : (
            <CourierLogo courier={selected} />
          )}
        </span>
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[activeIdx] ? `${listId}-${activeIdx}` : undefined}
          autoComplete="off"
          value={open ? query : selected?.name ?? (isLoading ? 'Loading couriers…' : value)}
          placeholder={open ? `Search ${total ? total.toLocaleString('en-IN') : ''} couriers…` : 'Choose a courier'}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="input pl-9 pr-8"
        />
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden
        >
          <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)]">
          {!query && (
            <p className="border-b border-slate-100 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Popular in India · type to search all {total.toLocaleString('en-IN')}
            </p>
          )}
          <ul ref={listRef} id={listId} role="listbox" aria-label="Couriers" className="max-h-64 overflow-y-auto p-1">
            {isError && <li className="px-3 py-3 text-[13px] text-red-600">Couldn’t load the courier list.</li>}
            {!isError && results.length === 0 && (
              <li className="px-3 py-3 text-[13px] text-slate-500">No courier matches “{query}”.</li>
            )}
            {results.map((c, i) => (
              <li
                key={c.code}
                id={`${listId}-${i}`}
                data-idx={i}
                role="option"
                aria-selected={c.code === value}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(c.code)}
                onMouseEnter={() => setActiveIdx(i)}
                className={clsx(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]',
                  i === activeIdx ? 'bg-slate-100' : '',
                  c.code === value ? 'font-semibold text-slate-950' : 'text-slate-700'
                )}
              >
                <CourierLogo courier={c} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-slate-400">{c.country}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AWB-based suggestions - a guess from the number's format, so the person decides. */}
      {trackingNumber !== undefined && (
        <div className="mt-1.5 text-[12px] text-slate-500">
          {suggestions.state === 'idle' && (
            <button
              type="button"
              onClick={suggest}
              disabled={!trackingNumber.trim()}
              className="font-medium text-brand-700 hover:text-brand-900 disabled:text-slate-400"
            >
              Suggest from AWB
            </button>
          )}
          {suggestions.state === 'loading' && 'Checking the number’s format…'}
          {suggestions.state === 'error' && 'Couldn’t check that number - pick the courier from the list.'}
          {suggestions.state === 'done' &&
            (suggestions.list.length === 0 ? (
              'No courier recognises that number’s format - pick from the list.'
            ) : (
              <span className="flex flex-wrap items-center gap-1.5">
                <span>Format matches:</span>
                {suggestions.list.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => onChange(c.code)}
                    className={clsx(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ring-inset transition',
                      c.code === value
                        ? 'bg-brand-50 text-brand-900 ring-brand-300'
                        : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                    )}
                  >
                    <CourierLogo courier={c} size={14} />
                    {c.name}
                  </button>
                ))}
                <span className="basis-full text-slate-400">A guess from the number - check the booking slip.</span>
              </span>
            ))}
        </div>
      )}

      {needs.includes('tracking_postal_code') && (
        <p className="mt-1.5 text-[12px] text-amber-700">This courier needs the delivery pincode to track - fill it in below.</p>
      )}
      {unsupported.length > 0 && (
        <p className="mt-1.5 text-[12px] text-red-600">
          This courier also needs an account number or tracking key, which can’t be sent yet - tracking may not start.
        </p>
      )}
    </div>
  );
}
