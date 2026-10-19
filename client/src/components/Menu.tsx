import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  const [pos, setPos] = useState<CSSProperties | null>(null);

  // Under the button (or above it, near the bottom of the screen), lined up with its edge.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const vertical: CSSProperties = below < 220 && r.top > below ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 };
      const horizontal: CSSProperties = align === 'right' ? { right: Math.max(8, window.innerWidth - r.right) } : { left: Math.max(8, r.left) };
      setPos({ ...vertical, ...horizontal });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
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
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Land focus on the first item once the panel is placed, so keyboard users can act straight away.
  const placed = Boolean(pos);
  useEffect(() => {
    if (open && placed) panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, placed]);

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
      {/* On top of the page (a portal), so a card that clips its contents can't hide it. */}
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={label}
            onClick={() => setOpen(false)}
            style={pos}
            className="fixed z-50 min-w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)]"
          >
            {children}
          </div>,
          document.body
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
