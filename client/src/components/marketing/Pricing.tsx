import { useState } from 'react';
import clsx from 'clsx';
import {
  ANNUAL_DISCOUNT_LABEL,
  ANNUAL_MONTHS_CHARGED,
  CURRENCY,
  PLANS,
  VOLUME_SLIDER,
  recommendPlan,
  type Plan,
} from '../../config/pricing';
import { SectionMark } from './SectionMark';

type Cycle = 'monthly' | 'annual';

/** Annual is billed up front but shown as an effective monthly rate, which is what buyers compare on. */
function effectiveMonthly(plan: Plan, cycle: Cycle): number | null {
  if (plan.monthlyInr === null) return null;
  return cycle === 'annual' ? Math.round((plan.monthlyInr * ANNUAL_MONTHS_CHARGED) / 12) : plan.monthlyInr;
}

function formatVolume(n: number) {
  return n >= VOLUME_SLIDER.max ? `${VOLUME_SLIDER.max.toLocaleString('en-IN')}+` : n.toLocaleString('en-IN');
}

export function Pricing({ onEnquire }: { onEnquire: (plan: string, monthlyShipments: string) => void }) {
  const [cycle, setCycle] = useState<Cycle>('annual');
  const [volume, setVolume] = useState(VOLUME_SLIDER.initial);
  const recommended = recommendPlan(volume);
  const fillPct = ((volume - VOLUME_SLIDER.min) / (VOLUME_SLIDER.max - VOLUME_SLIDER.min)) * 100;

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-10">
        <div className="lg:col-span-7">
          <SectionMark index="04" label="Pricing" />
          <h2 className="mt-5 font-display text-[34px] font-semibold leading-[1.06] tracking-[-0.025em] text-slate-950 sm:text-[46px]">
            Priced on shipments, not seats.
          </h2>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-slate-600">
            Your bill tracks parcels watched, not how many people log in. Every plan includes customer tracking
            pages.
          </p>
        </div>

        <div className="lg:col-span-5 lg:flex lg:justify-end lg:pb-2">
          <div role="group" aria-label="Billing cycle" className="inline-flex rounded-full bg-slate-100 p-1">
            {(['monthly', 'annual'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setCycle(option)}
                aria-pressed={cycle === option}
                className={clsx(
                  'rounded-full px-4 py-2 text-[13px] font-medium transition',
                  cycle === option ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                )}
              >
                {option === 'monthly' ? 'Monthly' : 'Annual'}
                {option === 'annual' && (
                  <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[11px] font-medium text-brand-800">
                    {ANNUAL_DISCOUNT_LABEL}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* "Which plan fits me?" - drag and the recommendation (the dark card) follows. */}
      <div className="mt-12 rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-900/[0.05] sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label htmlFor="volume" className="text-[15px] font-medium text-slate-900">
            How many shipments do you send a month?
          </label>
          <p className="flex items-baseline gap-2">
            <span className="font-display text-[36px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-slate-950">
              {formatVolume(volume)}
            </span>
            <span className="text-[14px] text-slate-500">/ month</span>
          </p>
        </div>
        <input
          id="volume"
          type="range"
          min={VOLUME_SLIDER.min}
          max={VOLUME_SLIDER.max}
          step={VOLUME_SLIDER.step}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-valuetext={`${formatVolume(volume)} shipments a month - ${recommended.name} plan`}
          className="range-slider mt-6 w-full"
          style={{ ['--fill' as string]: `${fillPct}%` }}
        />
        <div className="mt-3 flex justify-between font-mono text-[11px] text-slate-400">
          <span>{VOLUME_SLIDER.min}</span>
          <span>{VOLUME_SLIDER.max.toLocaleString('en-IN')}+</span>
        </div>
        <p className="mt-4 text-[14px] text-slate-600">
          At this volume, <strong className="font-semibold text-slate-950">{recommended.name}</strong> fits
          {recommended.maxShipments
            ? ` — up to ${recommended.maxShipments.toLocaleString('en-IN')} shipments a month.`
            : ' — no cap on shipments.'}
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const price = effectiveMonthly(plan, cycle);
          const dark = plan.id === recommended.id;
          return (
            <div
              key={plan.id}
              className={clsx(
                'relative flex flex-col rounded-2xl p-7 transition-[background-color,box-shadow,transform] duration-300',
                dark
                  ? 'bg-slate-950 text-white shadow-[0_24px_60px_-24px_rgba(2,6,23,0.55)] lg:-translate-y-2'
                  : 'bg-white ring-1 ring-slate-900/[0.08]'
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className={clsx('font-display text-[18px] font-semibold tracking-[-0.01em]', dark ? 'text-white' : 'text-slate-950')}>
                  {plan.name}
                </h3>
                {dark && (
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-brand-200">
                    Best fit for you
                  </span>
                )}
              </div>
              <p className={clsx('mt-1.5 text-[14px]', dark ? 'text-slate-400' : 'text-slate-500')}>{plan.tagline}</p>

              <div className="mt-8">
                {price === null ? (
                  <p className="font-display text-[44px] font-semibold leading-none tracking-[-0.03em]">Custom</p>
                ) : (
                  <p className="flex items-baseline gap-1">
                    <span className="font-display text-[44px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                      {CURRENCY}
                      {price.toLocaleString('en-IN')}
                    </span>
                    <span className={clsx('text-[14px]', dark ? 'text-slate-400' : 'text-slate-500')}>/mo</span>
                  </p>
                )}
                <p className={clsx('mt-2.5 text-[12.5px]', dark ? 'text-slate-500' : 'text-slate-400')}>
                  {price === null
                    ? 'Priced on your volume and integrations'
                    : cycle === 'annual'
                      ? `${CURRENCY}${(price * 12).toLocaleString('en-IN')} billed yearly`
                      : 'Billed monthly · cancel any time'}
                </p>
              </div>

              <button
                onClick={() => onEnquire(plan.name, formatVolume(volume))}
                className={clsx(
                  'mt-7 w-full rounded-full py-3 text-[14px] font-medium transition',
                  dark
                    ? 'bg-white text-slate-950 hover:bg-brand-50'
                    : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                )}
              >
                {plan.cta}
              </button>

              <div className={clsx('mt-7 border-t pt-6', dark ? 'border-white/10' : 'border-slate-100')}>
                <p className={clsx('text-[13px] font-medium', dark ? 'text-white' : 'text-slate-900')}>
                  {plan.shipmentsPerMonth}
                  <span className={clsx('font-normal', dark ? 'text-slate-400' : 'text-slate-500')}> · {plan.seats}</span>
                </p>
                <ul className="mt-4 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={clsx('flex gap-2.5 text-[13.5px] leading-snug', dark ? 'text-slate-300' : 'text-slate-600')}
                    >
                      <svg
                        className={clsx('mt-0.5 shrink-0', dark ? 'text-brand-300' : 'text-brand-600')}
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden
                      >
                        <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-[13px] text-slate-500">
        All plans include public tracking pages and unlimited customer tracking links. Prices exclude GST.
      </p>
    </>
  );
}
