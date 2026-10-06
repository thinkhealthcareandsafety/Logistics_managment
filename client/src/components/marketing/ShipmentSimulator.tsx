import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { StatusBadge } from '../StatusBadge';
import { ProgressRail } from '../ProgressRail';
import { useInView, usePrefersReducedMotion } from '../../hooks/useInView';
import type { ShipmentStatus } from '../../types/shipment';

type Step = { status: ShipmentStatus; title: string; place: string; time: string };

type Scenario = {
  id: string;
  label: string;
  awb: string;
  item: string;
  destination: string;
  promised: string;
  /** Shown once the last step lands, for the case where the status alone doesn't say it. */
  lateBy?: string;
  steps: Step[];
  outcome: { tone: 'good' | 'warn' | 'bad'; title: string; body: string };
};

/**
 * Three journeys that show what the product is for. The happy path is the least
 * interesting one - the point is watching the late and stuck ones get caught.
 */
const SCENARIOS: Scenario[] = [
  {
    id: 'on-time',
    label: 'On time',
    awb: 'SM4417720398',
    item: 'Nitrile Gloves (M) · 40 boxes',
    destination: 'Greenleaf Pharmacy, Pune',
    promised: 'Promised Tue',
    steps: [
      { status: 'pending', title: 'Booked', place: 'Mumbai Warehouse', time: 'Mon 09:12' },
      { status: 'in_transit', title: 'Picked up', place: 'Mumbai Sorting Facility', time: 'Mon 14:40' },
      { status: 'in_transit', title: 'Arrived at hub', place: 'Pune Transit Hub', time: 'Tue 06:05' },
      { status: 'out_for_delivery', title: 'Out for delivery', place: 'Pune', time: 'Tue 10:30' },
      { status: 'delivered', title: 'Delivered', place: 'Signed for at goods-in', time: 'Tue 13:18' },
    ],
    outcome: {
      tone: 'good',
      title: 'Delivered on time',
      body: 'The customer is thanked and asked to rate the delivery. Nobody on your team had to do anything.',
    },
  },
  {
    id: 'late',
    label: 'Running late',
    awb: 'SM4417720455',
    item: 'IV Cannula 20G · 30 boxes',
    destination: 'Riverbend Medical, Nagpur',
    promised: 'Promised Thu',
    lateBy: '2d late',
    steps: [
      { status: 'pending', title: 'Booked', place: 'Surat Warehouse', time: 'Mon 10:02' },
      { status: 'in_transit', title: 'Picked up', place: 'Surat Sorting Facility', time: 'Mon 16:20' },
      { status: 'in_transit', title: 'Held at transit hub', place: 'Nagpur · onward connection delayed', time: 'Sat 08:45' },
    ],
    outcome: {
      tone: 'warn',
      title: 'Flagged: 2 days past the promised date',
      body: 'Moved to the top of your list and a WhatsApp alert went to ops — before the customer picked up the phone.',
    },
  },
  {
    id: 'customs',
    label: 'Held at customs',
    awb: 'SM5544332211',
    item: 'Digital Thermometers · 5 cartons',
    destination: 'Lakeside Clinic, New Delhi',
    promised: 'Promised Fri',
    steps: [
      { status: 'pending', title: 'Booked', place: 'Ahmedabad Hub', time: 'Wed 11:30' },
      { status: 'in_transit', title: 'Departed origin', place: 'Ahmedabad Airport', time: 'Wed 15:05' },
      { status: 'exception', title: 'Customs clearance delay', place: 'Delhi Air Cargo · documents under review', time: 'Thu 07:50' },
    ],
    outcome: {
      tone: 'bad',
      title: 'Exception raised for follow-up',
      body: 'Someone marks it as being chased and keeps the notes on the shipment, so the next person knows where it stands.',
    },
  },
];

const FIRST_STEP_MS = 500;
const STEP_MS = 1100;
/** How long a finished journey stays up before autoplay moves to the next one. */
const HOLD_MS = 4200;

const OUTCOME_STYLES = {
  good: { box: 'bg-emerald-50 ring-emerald-200', icon: 'bg-emerald-500', title: 'text-emerald-900', body: 'text-emerald-800/80' },
  warn: { box: 'bg-amber-50 ring-amber-200', icon: 'bg-amber-500', title: 'text-amber-900', body: 'text-amber-800/80' },
  bad: { box: 'bg-red-50 ring-red-200', icon: 'bg-red-500', title: 'text-red-900', body: 'text-red-800/80' },
};

export function ShipmentSimulator() {
  const reduced = usePrefersReducedMotion();
  // Not `once`: autoplay should stop when the visitor scrolls away and resume on return.
  const [ref, inView] = useInView<HTMLDivElement>();

  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  // Autoplay walks through all three journeys until the visitor picks one themselves.
  const [autoplay, setAutoplay] = useState(true);

  const scenario = SCENARIOS[index];
  const done = shown >= scenario.steps.length;
  const latest = shown > 0 ? scenario.steps[shown - 1] : null;

  // Reduced motion: no playback at all, just the finished journey.
  useEffect(() => {
    if (reduced) setShown(SCENARIOS[index].steps.length);
  }, [reduced, index]);

  useEffect(() => {
    if (reduced || !inView) return;

    if (!done) {
      const timer = setTimeout(() => setShown((n) => n + 1), shown === 0 ? FIRST_STEP_MS : STEP_MS);
      return () => clearTimeout(timer);
    }
    if (autoplay) {
      const timer = setTimeout(() => {
        setIndex((i) => (i + 1) % SCENARIOS.length);
        setShown(0);
      }, HOLD_MS);
      return () => clearTimeout(timer);
    }
  }, [shown, done, inView, reduced, autoplay]);

  function choose(i: number) {
    setAutoplay(false);
    setIndex(i);
    setShown(reduced ? SCENARIOS[i].steps.length : 0);
  }

  function replay() {
    setShown(reduced ? scenario.steps.length : 0);
  }

  const currentStatus: ShipmentStatus = latest?.status ?? 'pending';
  const outcome = OUTCOME_STYLES[scenario.outcome.tone];

  return (
    // `isolate` gives the glow's -z-10 a local stacking context; without it the glow
    // would slide behind the page's own white background and vanish.
    <div ref={ref} className="relative isolate">
      {/* Soft glow so the card sits on the page rather than floating in white. */}
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand-100/70 via-white to-emerald-50/60 blur-2xl" />

      <div className="overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_24px_60px_-20px_rgba(15,76,92,0.28)] ring-1 ring-slate-900/[0.07]">
        {/* Scenario picker */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div role="tablist" aria-label="Choose a delivery scenario" className="flex gap-1 rounded-full bg-slate-100 p-1">
            {SCENARIOS.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={i === index}
                onClick={() => choose(i)}
                className={clsx(
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium transition',
                  i === index ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            onClick={replay}
            aria-label="Replay this journey"
            className={clsx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 ring-1 ring-slate-200 transition hover:text-slate-900 hover:ring-slate-300',
              !done && 'pointer-events-none opacity-0'
            )}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M3 12a9 9 0 1 0 2.64-6.36M3 3v6h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {/* Shipment header - the status pill updates live as scans arrive */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[13px] font-semibold text-slate-950">{scenario.awb}</p>
              <p className="mt-1 text-[14px] font-medium text-slate-800 sm:truncate">{scenario.item}</p>
              <p className="text-[12.5px] text-slate-500 sm:truncate">
                To {scenario.destination} · {scenario.promised}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <StatusBadge status={currentStatus} variant="pill" />
              {scenario.lateBy && done && (
                <span className="step-in rounded bg-red-100 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-red-700">
                  {scenario.lateBy}
                </span>
              )}
            </div>
          </div>

          <ProgressRail status={currentStatus} className="mt-5" />

          {/* Checkpoints, arriving one at a time. Fixed height so the card doesn't
              jump as rows land - the longest journey has five. */}
          <ol aria-live="polite" className="mt-5 h-[232px] space-y-0">
            {scenario.steps.slice(0, shown).map((step, i) => {
              const isLatest = i === shown - 1;
              const tone =
                step.status === 'exception'
                  ? 'bg-red-500'
                  : isLatest && scenario.lateBy && done
                    ? 'bg-amber-500'
                    : isLatest
                      ? 'bg-brand-600'
                      : 'bg-slate-300';
              return (
                <li key={`${scenario.id}-${i}`} className="step-in relative flex gap-3.5 pb-3.5 last:pb-0">
                  {/* rail between dots */}
                  {i < shown - 1 && <span aria-hidden className="absolute left-[5px] top-4 h-full w-px bg-slate-200" />}
                  <span className="relative mt-1.5 flex h-[11px] w-[11px] shrink-0 items-center justify-center">
                    {isLatest && !reduced && (
                      <span aria-hidden className={clsx('absolute inset-0 animate-ping rounded-full opacity-40', tone)} />
                    )}
                    <span className={clsx('relative h-[11px] w-[11px] rounded-full ring-[3px] ring-white', tone)} />
                  </span>
                  <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className={clsx('text-[13.5px] font-medium', isLatest ? 'text-slate-950' : 'text-slate-600')}>
                        {step.title}
                      </p>
                      <p className="truncate text-[12px] text-slate-500">{step.place}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-slate-400">{step.time}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* What ThinkHealth did about it - the actual point of the demo */}
        <div className="relative min-h-[92px] border-t border-slate-100 px-5 py-4 sm:px-6">
          {done ? (
            <div key={scenario.id} className={clsx('step-in flex gap-3 rounded-2xl p-3.5 ring-1', outcome.box)}>
              <span className={clsx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', outcome.icon)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" aria-hidden>
                  {scenario.outcome.tone === 'good' ? (
                    <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <path d="M12 7v6M12 17h.01" strokeLinecap="round" />
                  )}
                </svg>
              </span>
              <div>
                <p className={clsx('text-[13.5px] font-semibold', outcome.title)}>{scenario.outcome.title}</p>
                <p className={clsx('mt-0.5 text-[12.5px] leading-relaxed', outcome.body)}>{scenario.outcome.body}</p>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 pt-2 text-[12.5px] text-slate-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
              Watching for the next scan…
            </p>
          )}

          {/* Visible countdown to the next scenario, so autoplay never feels random */}
          {done && autoplay && !reduced && inView && (
            <span
              key={`bar-${scenario.id}`}
              aria-hidden
              style={{ ['--fill-duration' as string]: `${HOLD_MS}ms` }}
              className="fill-bar absolute inset-x-0 bottom-0 h-0.5 bg-brand-500/60"
            />
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-[12.5px] text-slate-500">
        A live simulation — pick a scenario to see how each one is handled.
      </p>
    </div>
  );
}
