import { TrackingFlow } from './TrackingFlow';
import { SectionMark } from './SectionMark';
import { Reveal } from './Reveal';

const STEPS: { title: string; body: string }[] = [
  {
    title: 'The consignment is booked',
    body: 'Your order system posts the AWB to the ingest API the moment it exists. Or add it by hand, or drop in a day of bookings as a CSV.',
  },
  {
    title: 'We watch it so you don’t',
    body: 'Each courier is polled on a schedule and every scan is translated into one plain status. Nobody reads raw courier codes again.',
  },
  {
    title: 'The right people hear first',
    body: 'Anything that slips jumps to the top of your list. Alerts go out on WhatsApp and email, and the customer refreshes their own tracking page.',
  },
];

/** Three steps beside the system diagram. Static on purpose: every step is readable at once. */
export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16">
      <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
        <Reveal>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-7">
              <SectionMark index="01" label="How it works" />
              <h2 className="mt-5 font-display text-[34px] font-semibold leading-[1.06] tracking-[-0.025em] text-slate-950 sm:text-[46px]">
                Every courier, one way of working.
              </h2>
            </div>
            <p className="self-end text-[16px] leading-relaxed text-slate-600 lg:col-span-5 lg:pb-2">
              Book with whichever courier suits the lane — Shree Maruti, Delhivery, Blue Dart or any of 1,600+ on
              TrackingMore. Statuses, alerts and analytics work the same for all of them, so switching couriers never
              means switching tools.
            </p>
          </div>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-10">
          <ol className="space-y-0 lg:col-span-5">
            {STEPS.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[2.5rem_1fr] border-t border-slate-200 py-7 last:border-b">
                <span className="font-mono text-[13px] text-slate-400">0{i + 1}</span>
                <div>
                  <h3 className="font-display text-[19px] font-semibold tracking-[-0.01em] text-slate-950">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex items-center lg:col-span-7">
            <div className="w-full rounded-2xl bg-slate-50 p-6 ring-1 ring-slate-900/[0.06] sm:p-10">
              <TrackingFlow />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
