import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Minimal dropdown: a trigger plus a panel of actions. Closes on outside click, Escape
 * (returning focus to the trigger) and after any item is chosen. Enough for overflow
 * and account menus without pulling in a headless-UI dependency.
 */
export function Menu({
  trigger,
  label,
  align = 'right',
  children,
  triggerClassName,
}: {
  trigger: ReactNode;
  label: string;
  align?: 'left' | 'right';
  children: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
        if (!items.length) return;
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
        items[next].focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    // Land focus on the first item so keyboard users can act straight away.
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          onClick={() => setOpen(false)}
          className={clsx(
            'absolute z-40 mt-1.5 min-w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)]',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onSelect,
  href,
  tone,
  icon,
  children,
}: {
  onSelect?: () => void;
  href?: string;
  tone?: 'danger';
  icon?: ReactNode;
  children: ReactNode;
}) {
  const className = clsx(
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium outline-none transition',
    tone === 'danger'
      ? 'text-red-600 hover:bg-red-50 focus-visible:bg-red-50'
      : 'text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100'
  );
  const content = (
    <>
      {icon && <span className={clsx('shrink-0', tone === 'danger' ? 'text-red-500' : 'text-slate-400')}>{icon}</span>}
      {children}
    </>
  );
  if (href) {
    return (
      <a role="menuitem" href={href} className={className}>
        {content}
      </a>
    );
  }
  return (
    <button role="menuitem" type="button" onClick={onSelect} className={className}>
      {content}
    </button>
  );
}

export function MenuDivider() {
  return <div role="separator" className="my-1 h-px bg-slate-100" />;
}
