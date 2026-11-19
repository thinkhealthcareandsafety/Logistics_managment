import { lazy, Suspense, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { carriersQuery } from '../hooks/useCarriers';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageLoader } from './ui/Loading';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from './NotificationBell';
import { Menu, MenuDivider, MenuItem } from './Menu';
import { ErrorBoundary } from './ErrorBoundary';
import { getInitials } from '../utils/avatar';
import { BrandLockup } from './ui/BrandMark';
import { CreditsPill } from './TrackingCredits';

import { RouteSkeleton } from './skeletons/PageSkeletons';
import { TopProgress } from './ui/TopProgress';
// Its own download, after the page - it never slows the first screen.
const AssistantWidget = lazy(() => import('./assistant/AssistantWidget').then((m) => ({ default: m.AssistantWidget })));
/**
 * Primary nav is the work (shipments, stock, performance). Personal things - profile,
 * notification settings, signing out - live under the avatar, where every SaaS user
 * already looks for them.
 */
const NAV: { to: string; label: string; short?: string; icon: TabIconName; match: string[] }[] = [
  // A shipment's detail page is part of Shipments, so the tab stays lit there.
  { to: '/dashboard', label: 'Shipments', icon: 'truck', match: ['/dashboard', '/shipments'] },
  { to: '/stock', label: 'Stock', icon: 'box', match: ['/stock'] },
  { to: '/manual-stock', label: 'Manual stock', short: 'Manual', icon: 'clipboard', match: ['/manual-stock'] },
  { to: '/couriers', label: 'Couriers', icon: 'route', match: ['/couriers'] },
  { to: '/analytics', label: 'Analytics', icon: 'chart', match: ['/analytics'] },
];

type TabIconName = 'truck' | 'box' | 'clipboard' | 'route' | 'chart';

/** The phone tab bar's icons - filled in lightly when that tab is open. */
function TabIcon({ name, active }: { name: TabIconName; active: boolean }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: active ? 2.1 : 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
  const fill = active ? 'currentColor' : 'none';
  switch (name) {
    case 'truck':
      return (
        <svg {...p}>
          <path d="M3 6.5h11v9H3z" fill={fill} fillOpacity={0.12} />
          <path d="M14 9.5h3.6l3.4 3.4v2.6h-7" />
          <circle cx="7" cy="17.5" r="1.8" />
          <circle cx="17.5" cy="17.5" r="1.8" />
        </svg>
      );
    case 'box':
      return (
        <svg {...p}>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" fill={fill} fillOpacity={0.12} />
          <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
        </svg>
      );
    case 'clipboard':
      return (
        <svg {...p}>
          <rect x="5" y="4.5" width="14" height="16.5" rx="2" fill={fill} fillOpacity={0.12} />
          <path d="M9 4.5V3.5h6v1M8.5 10h7M8.5 13.5h7M8.5 17h4" />
        </svg>
      );
    case 'route':
      return (
        <svg {...p}>
          <circle cx="6" cy="18" r="2.2" fill={fill} fillOpacity={0.2} />
          <circle cx="18" cy="6" r="2.2" fill={fill} fillOpacity={0.2} />
          <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...p}>
          <path d="M4 20h16" />
          <rect x="5.5" y="11" width="3" height="6.5" rx="0.8" fill={fill} fillOpacity={0.2} />
          <rect x="10.5" y="7" width="3" height="10.5" rx="0.8" fill={fill} fillOpacity={0.2} />
          <rect x="15.5" y="13" width="3" height="4.5" rx="0.8" fill={fill} fillOpacity={0.2} />
        </svg>
      );
  }
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Load the courier catalogue in the background right after sign-in, so the
  // courier picker in "Add shipment" is ready the moment it's opened.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!queryClient.getQueryData(carriersQuery.queryKey)) queryClient.prefetchQuery(carriersQuery);
  }, [queryClient]);

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
            <Link
              to="/login"
              title="Go to the sign-in page"
              className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <BrandLockup hideTextOnPhone />
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
            <CreditsPill />
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
      </header>

      {/* Room at the bottom for the phone tab bar (--bottom-nav is 0 on bigger screens). */}
      <main className="mx-auto max-w-7xl px-4 pb-[calc(var(--bottom-nav)+1.5rem)] pt-5 sm:px-6 sm:py-8">
        <ErrorBoundary key={pathname}>
          {/* A page opened for the first time downloads first - show its shape meanwhile. */}
          <Suspense
            fallback={
              <>
                <TopProgress force />
                <RouteSkeleton />
              </>
            }
          >
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      {/* Phones: the main tabs at the bottom, in thumb reach, like an installed app. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            aria-current={item.active ? 'page' : undefined}
            className={clsx(
              'relative flex h-[3.75rem] flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors',
              item.active ? 'text-brand-900' : 'text-slate-500 active:text-slate-900'
            )}
          >
            {item.active && <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-brand-700" />}
            <TabIcon name={item.icon} active={item.active} />
            <span className="leading-none">{item.short || item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Rule-based assistant - answers from the live data, no AI service or cost. */}
      <Suspense fallback={null}>
        <AssistantWidget />
      </Suspense>
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
