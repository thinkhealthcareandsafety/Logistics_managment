import { useId } from 'react';
import clsx from 'clsx';

/**
 * The SureShip mark: a parcel with a check mark sweeping out past its corner - shipped,
 * for sure - and two motion lines, in a deep-teal tile. The check carries a dark
 * outline so it reads on the white box and on the tile alike, from 16 px (favicon) up.
 * Keep in step with client/public/favicon.svg.
 */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={clsx('shrink-0', className)} role="img" aria-label="SureShip">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#14808f" />
          <stop offset="1" stopColor="#063540" />
        </linearGradient>
        <linearGradient id={`${id}-ck`} x1="9" y1="22" x2="28" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a7f3d0" />
          <stop offset="1" stopColor="#2dd4bf" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id}-bg)`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#ffffff" strokeOpacity="0.14" />
      {/* Motion lines behind the parcel. */}
      <rect x="2.2" y="13.6" width="2.8" height="1.4" rx="0.7" fill="#5eead4" fillOpacity="0.6" />
      <rect x="2.9" y="17.8" width="2.1" height="1.4" rx="0.7" fill="#5eead4" fillOpacity="0.4" />
      {/* The parcel: lit top, two shaded sides. */}
      <polygon points="15.5,6.6 24.5,11.1 15.5,15.6 6.5,11.1" fill="#ffffff" />
      <polygon points="6.5,11.1 15.5,15.6 15.5,25.6 6.5,21.1" fill="#ffffff" fillOpacity="0.82" />
      <polygon points="24.5,11.1 15.5,15.6 15.5,25.6 24.5,21.1" fill="#ffffff" fillOpacity="0.62" />
      {/* The check, outlined so it holds on white and on teal. */}
      <path d="M10.7 16.9 14.9 21 27.6 7.3" fill="none" stroke="#06343f" strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.7 16.9 14.9 21 27.6 7.3" fill="none" stroke={`url(#${id}-ck)`} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark + "SureShip / by ThinkHealth" wordmark, for headers. */
export function BrandLockup({ size = 32, hideTextOnPhone = false }: { size?: number; hideTextOnPhone?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark size={size} />
      <span className={clsx('flex-col leading-none', hideTextOnPhone ? 'hidden sm:flex' : 'flex')}>
        <span className="text-[16px] font-extrabold tracking-[-0.03em] text-slate-900">
          Sure<span className="text-brand-700">Ship</span>
        </span>
        <span className="mt-[3px] text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">by ThinkHealth</span>
      </span>
    </span>
  );
}
