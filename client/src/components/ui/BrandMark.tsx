import { useId } from 'react';
import clsx from 'clsx';

/**
 * The ThinkHealth Logistics mark: a medical cross whose right arm is an arrow - care,
 * on the move - in a deep-teal tile. Reads at 16 px (favicon) and at 48 px (sign-in).
 */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={clsx('shrink-0', className)} role="img" aria-label="ThinkHealth Logistics">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1a6b78" />
          <stop offset="1" stopColor="#0a2e37" />
        </linearGradient>
        <linearGradient id={`${id}-tip`} x1="18" y1="10" x2="27" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7ee0d0" />
          <stop offset="1" stopColor="#34c3ad" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id}-bg)`} />
      {/* Soft highlight along the top edge, like a lit tile. */}
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#ffffff" strokeOpacity="0.14" />
      {/* The cross. */}
      <rect x="11" y="7" width="5.4" height="18" rx="1.4" fill="#ffffff" />
      <rect x="5" y="13.3" width="14.5" height="5.4" rx="1.4" fill="#ffffff" />
      {/* Its right arm runs on as an arrow. */}
      <path d="M18.6 9.8 26.6 16 18.6 22.2Z" fill={`url(#${id}-tip)`} strokeLinejoin="round" />
      {/* Motion: two short trails behind the cross. */}
      <rect x="2.6" y="10.4" width="5.2" height="1.6" rx="0.8" fill="#7ee0d0" fillOpacity="0.55" />
      <rect x="3.6" y="20" width="4.2" height="1.6" rx="0.8" fill="#7ee0d0" fillOpacity="0.35" />
    </svg>
  );
}

/** Mark + "ThinkHealth / LOGISTICS" wordmark, for headers. */
export function BrandLockup({ size = 32, hideTextOnPhone = false }: { size?: number; hideTextOnPhone?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark size={size} />
      <span className={clsx('flex-col leading-none', hideTextOnPhone ? 'hidden sm:flex' : 'flex')}>
        <span className="text-[15px] font-bold tracking-tight text-slate-900">
          Think<span className="text-brand-700">Health</span>
        </span>
        <span className="mt-[3px] text-[9.5px] font-semibold uppercase tracking-[0.22em] text-slate-500">Logistics</span>
      </span>
    </span>
  );
}
