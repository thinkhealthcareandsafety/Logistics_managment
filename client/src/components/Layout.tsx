import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageLoader } from './ui/Loading';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from './NotificationBell';
import { Menu, MenuDivider, MenuItem } from './Menu';
import { ErrorBoundary } from './ErrorBoundary';
import { getInitials } from '../utils/avatar';

import { RouteSkeleton } from './skeletons/PageSkeletons';
/**
 * Primary nav is the work (shipments, stock, performance). Personal things - profile,
 * notification settings, signing out - live under the avatar, where every SaaS user
 * already looks for them.
 */
const NAV = [
  // A shipment's detail page is part of Shipments, so the tab stays lit there.
  { to: '/dashboard', label: 'Shipments', match: ['/dashboard', '/shipments'] },
  { to: '/stock', label: 'Stock', match: ['/stock'] },
  { to: '/analytics', label: 'Analytics', match: ['/analytics'] },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  if (signingOut) return <PageLoader label="Signing out" />;

  const nav = NAV.map((item) => ({ ...item, active: item.match.some((p) => pathname.startsWith(p)) }));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-900 text-[13px] font-bold text-white">
                TH
              </span>
              <span className="hidden text-[14px] font-semibold text-slate-900 sm:block">ThinkHealth Logistics</span>
            </Link>
            <nav aria-label="Main" className="hidden h-14 items-stretch gap-6 sm:flex">
              {nav.map((item) => (
                <NavItem key={item.to} to={item.to} active={item.active}>
                  {item.label}
                </NavItem>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            <NotificationBell />
            <Menu
              label="Account"
              triggerClassName="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-100 aria-expanded:bg-slate-100"
              trigger={
                <>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900 text-[11px] font-bold text-white">
                    {getInitials(user?.name || '')}
                  </span>
                  <span className="hidden max-w-[160px] truncate md:block">{user?.name}</span>
                  <svg className="text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              }
            >
              <div className="px-2.5 pb-2 pt-1.5">
                <p className="truncate text-[13px] font-semibold text-slate-900">{user?.name}</p>
                <p className="truncate text-[12px] text-slate-500">{user?.email}</p>
              </div>
              <MenuDivider />
              <MenuItem onSelect={() => navigate('/profile')} icon={<UserIcon />}>
                Profile
              </MenuItem>
              <MenuItem onSelect={() => navigate('/settings')} icon={<BellSmallIcon />}>
                Notification settings
              </MenuItem>
              <MenuDivider />
              <MenuItem onSelect={signOut} icon={<LogoutIcon />}>
                Log out
              </MenuItem>
            </Menu>
          </div>
        </div>
        <nav aria-label="Main" className="flex gap-6 border-t border-slate-100 px-4 sm:hidden">
          {nav.map((item) => (
            <NavItem key={item.to} to={item.to} active={item.active}>
              {item.label}
            </NavItem>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <ErrorBoundary key={pathname}>
          {/* A page opened for the first time downloads first - show its shape meanwhile. */}
          <Suspense fallback={<RouteSkeleton />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

function NavItem({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        '-mb-px flex items-center border-b-2 py-2.5 text-[13px] font-medium transition-colors sm:py-0',
        active ? 'border-brand-900 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-900'
      )}
    >
      {children}
    </NavLink>
  );
}

const iconProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true } as const;

function UserIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" />
    </svg>
  );
}

function BellSmallIcon() {
  return (
    <svg {...iconProps}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg {...iconProps}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
