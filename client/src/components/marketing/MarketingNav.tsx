import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

/** Flat jump links to sections that exist on the page. No dropdowns - it's one page. */
const LINKS = [
  { label: 'How it works', href: '#how' },
  { label: 'Platform', href: '#platform' },
  { label: 'Developer', href: '#developer' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Track a shipment', href: '#track' },
];

export function MarketingNav() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Transparent over the hero, a frosted bar with a hairline once content scrolls under it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={clsx(
        'sticky top-0 z-40 transition-[background-color,box-shadow] duration-300',
        scrolled || isOpen
          ? 'bg-white/80 shadow-[0_1px_0_rgba(15,23,42,0.08)] backdrop-blur-xl'
          : 'bg-transparent'
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-900 text-[11px] font-bold text-white">
            TH
          </span>
          <span className="font-display text-[16px] font-semibold tracking-[-0.01em] text-slate-950">ThinkHealth</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-[14px] text-slate-600 transition hover:bg-slate-900/[0.04] hover:text-slate-950"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden shrink-0 sm:flex">
          <Link
            to="/login"
            className="rounded-full bg-slate-950 px-5 py-2 text-[14px] font-medium text-white transition hover:bg-brand-900"
          >
            Sign in
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-label="Toggle menu"
          className="rounded-full p-2 text-slate-700 ring-1 ring-slate-200 lg:hidden"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            {isOpen ? <path d="M3 3l10 10M13 3L3 13" /> : <path d="M2 5h12M2 11h12" />}
          </svg>
        </button>
      </div>

      {isOpen && (
        <nav className="border-t border-slate-200 px-5 pb-5 pt-2 lg:hidden">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className="block border-b border-slate-100 py-3.5 font-display text-[17px] font-medium text-slate-900"
            >
              {link.label}
            </a>
          ))}
          <Link
            to="/login"
            className="mt-5 block rounded-full bg-slate-950 py-3 text-center text-[15px] font-medium text-white"
          >
            Sign in
          </Link>
        </nav>
      )}
    </header>
  );
}
