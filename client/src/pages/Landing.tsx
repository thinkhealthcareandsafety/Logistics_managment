import { useState } from 'react';
import clsx from 'clsx';
import { MarketingNav } from '../components/marketing/MarketingNav';
import { TrackLookup } from '../components/marketing/TrackLookup';
import { ShipmentSimulator } from '../components/marketing/ShipmentSimulator';
import { HowItWorks } from '../components/marketing/HowItWorks';
import { Reveal } from '../components/marketing/Reveal';
import { Pricing } from '../components/marketing/Pricing';
import { Reviews } from '../components/marketing/Reviews';
import { FAQ } from '../components/marketing/FAQ';
import { ContactDialog } from '../components/marketing/ContactDialog';
import { DeveloperSection } from '../components/marketing/DeveloperSection';
import { SectionMark } from '../components/marketing/SectionMark';
import { CourierStrip, useCourierCount } from '../components/marketing/CourierStrip';

const PROOF = [
  {
    figure: '5',
    label: 'statuses',
    body: 'Every courier’s scan codes collapse into the same five words your team already uses.',
  },
  {
    figure: '0',
    label: 'logins for customers',
    body: 'They track with the AWB alone. No account, no app, no personal data on the page.',
  },
  {
    figure: 'Live',
    label: 'updates',
    body: 'New checkpoints stream into the open dashboard. Nobody presses refresh.',
  },
];

type Contact = { plan: string; monthlyShipments?: string };

export function Landing() {
  const courierCount = useCourierCount();
  const proof = [
    {
      figure: courierCount,
      label: 'couriers',
      body: 'Shree Maruti, Delhivery, Blue Dart, DTDC, India Post and the rest - one dashboard for all of them.',
    },
    ...PROOF,
  ];
  const [contact, setContact] = useState<Contact | null>(null);
  const openContact = (plan: string, monthlyShipments?: string) => setContact({ plan, monthlyShipments });

  return (
    <div className="min-h-screen bg-white text-slate-700">
      <MarketingNav />

      {/* ───────────── Hero ───────────── */}
      <section className="relative overflow-hidden">
        {/* Dot grid, faded out toward the edges. Texture without a stock gradient. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(#0f4c5c_1px,transparent_1px)] opacity-[0.07] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_30%_30%,black,transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 top-10 h-[520px] w-[720px] rounded-full bg-brand-200/40 blur-3xl"
        />

        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-12 lg:gap-12 lg:pb-28 lg:pt-20">
          <Reveal className="min-w-0 lg:col-span-6">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/70 py-1 pl-1.5 pr-3 text-[13px] text-slate-600 ring-1 ring-slate-900/[0.08] backdrop-blur">
              <span className="rounded-full bg-brand-900 px-2 py-0.5 text-[11px] font-medium text-white">Live</span>
              Tracking {courierCount} couriers, from Shree Maruti to Blue Dart
            </p>

            <h1 className="mt-7 max-w-xl text-balance font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] text-slate-950 sm:text-[62px]">
              Find the late shipment before the phone rings.
            </h1>

            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-slate-600">
              ThinkHealth watches every consignment you’ve booked, whichever courier carries it, puts the ones that
              slipped at the top of your list, and gives customers a tracking page so they stop calling to ask.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <button
                onClick={() => openContact('a demo')}
                className="group inline-flex items-center gap-2 rounded-full bg-slate-950 py-3 pl-6 pr-5 text-[15px] font-medium text-white transition hover:bg-brand-900"
              >
                Book a demo
                <Arrow className="transition-transform group-hover:translate-x-0.5" />
              </button>
              <a
                href="#pricing"
                className="text-[15px] font-medium text-slate-900 underline decoration-slate-300 underline-offset-[6px] transition hover:decoration-slate-900"
              >
                See pricing
              </a>
            </div>

            <div id="track" className="mt-14 max-w-md scroll-mt-24 border-t border-slate-200 pt-6">
              <p className="mb-2.5 text-[13px] font-medium text-slate-900">
                Have a tracking number?{' '}
                <span className="font-normal text-slate-500">No account needed.</span>
              </p>
              <TrackLookup size="sm" />
            </div>
          </Reveal>

          {/* Interactive: plays a real journey scan by scan and shows what the
              product does when it goes wrong. */}
          <Reveal className="min-w-0 lg:col-span-6" delay={150}>
            <ShipmentSimulator />
          </Reveal>
        </div>
      </section>

      {/* ───────────── Proof strip ───────────── */}
      <section className="border-y border-slate-200 bg-slate-50/60">
        <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-slate-200 px-5 sm:px-8 md:grid-cols-2 md:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {proof.map((item, i) => (
            <Reveal key={item.label} delay={i * 100} className="py-8 md:pr-8 lg:px-8 lg:first:pl-0 lg:last:pr-0">
              <p className="flex items-baseline gap-2">
                <span className="font-display text-[40px] font-semibold leading-none tracking-[-0.03em] text-slate-950">
                  {item.figure}
                </span>
                <span className="text-[14px] font-medium text-slate-900">{item.label}</span>
              </p>
              <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-slate-500">{item.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <CourierStrip />

      <HowItWorks />

      {/* ───────────── Platform (bento) ───────────── */}
      <section id="platform" className="scroll-mt-16 bg-slate-50/60">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
          <Reveal>
            <SectionHeader
              index="02"
              label="Platform"
              title="Everything after the parcel leaves the warehouse."
              body="Built around the question your team asks every morning: what needs me today?"
            />
          </Reveal>

          <div className="mt-16 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <BentoCell
              className="lg:col-span-2"
              title="Attention first"
              body="Late and stuck shipments rise to the top with the reason attached. Everything else stays out of the way until it needs you."
              visual={<AttentionVisual />}
            />
            <BentoCell
              delay={80}
              title="Five states, no jargon"
              body="Every courier’s codes become the same words your team already uses."
              visual={<StatusesVisual />}
            />
            <BentoCell
              delay={0}
              title="Exception follow-up"
              body="Flag a parcel as being chased and keep the notes with the shipment, not in someone’s inbox."
              visual={<NotesVisual />}
            />
            <BentoCell
              delay={80}
              title="WhatsApp and email"
              body="Updates reach people on the channel they actually read."
              visual={<WhatsAppVisual />}
            />
            <BentoCell
              delay={160}
              title="Feedback on delivery"
              body="Customers are thanked and asked to rate the delivery the moment it lands."
              visual={<RatingVisual />}
            />
            <BentoCell
              className="lg:col-span-3"
              horizontal
              title="Analytics measured from real scans"
              body="Average transit time, on-time rate, exception rate and customer satisfaction — computed from checkpoint timestamps, not estimates. Import, export and bulk-archive whenever you need to."
              visual={<AnalyticsVisual />}
            />
          </div>
        </div>
      </section>

      <Reviews />

      <DeveloperSection />

      {/* ───────────── Pricing ───────────── */}
      <section id="pricing" className="scroll-mt-16">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
          <Reveal>
            <Pricing onEnquire={openContact} />
          </Reveal>
        </div>
      </section>

      {/* ───────────── FAQ ───────────── */}
      <section id="faq" className="scroll-mt-16 border-t border-slate-200">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-5 py-24 sm:px-8 lg:grid-cols-12 lg:py-32">
          <Reveal className="lg:col-span-4">
            <SectionMark index="05" label="Questions" />
            <h2 className="mt-5 font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.025em] text-slate-950 sm:text-[40px]">
              Before you ask.
            </h2>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-slate-600">
              Something we haven’t covered?{' '}
              <button
                onClick={() => openContact('a question')}
                className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
              >
                Ask us directly
              </button>
              .
            </p>
          </Reveal>
          <Reveal className="lg:col-span-8" delay={100}>
            <FAQ />
          </Reveal>
        </div>
      </section>

      {/* ───────────── Closing ───────────── */}
      <section className="px-5 pb-8 sm:px-8">
        <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-brand-950 px-8 py-16 sm:px-14 sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] opacity-[0.06] [background-size:22px_22px]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl"
          />
          <div className="relative grid items-end gap-10 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <h2 className="font-display text-[36px] font-semibold leading-[1.05] tracking-[-0.025em] text-white sm:text-[52px]">
                Start with the shipments you already have.
              </h2>
              <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-brand-100/80">
                Send us a CSV of open AWBs and the dashboard fills itself in on the first sync. We’ll walk you through
                it on the call.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
              <button
                onClick={() => openContact('a demo')}
                className="group inline-flex items-center gap-2 rounded-full bg-white py-3 pl-6 pr-5 text-[15px] font-medium text-slate-950 transition hover:bg-brand-50"
              >
                Book a demo
                <Arrow className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </Reveal>
      </section>

      <footer>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-10 text-[13px] text-slate-500 sm:px-8">
          <span className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-900 text-[10px] font-bold text-white">
              TH
            </span>
            ThinkHealth Logistics
          </span>
          <span className="tabular-nums">© {new Date().getFullYear()}</span>
        </div>
      </footer>

      {contact && (
        <ContactDialog
          plan={contact.plan}
          monthlyShipments={contact.monthlyShipments}
          onClose={() => setContact(null)}
        />
      )}
    </div>
  );
}

/* ───────────── Section scaffolding ───────────── */

function SectionHeader({
  index,
  label,
  title,
  body,
}: {
  index: string;
  label: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-7">
        <SectionMark index={index} label={label} />
        <h2 className="mt-5 font-display text-[34px] font-semibold leading-[1.06] tracking-[-0.025em] text-slate-950 sm:text-[46px]">
          {title}
        </h2>
      </div>
      {body && (
        <p className="self-end text-[16px] leading-relaxed text-slate-600 lg:col-span-5 lg:pb-2">{body}</p>
      )}
    </div>
  );
}

function BentoCell({
  title,
  body,
  visual,
  className,
  horizontal,
  delay = 0,
}: {
  title: string;
  body: string;
  visual: React.ReactNode;
  /** Grid placement (col-span) - lands on the Reveal wrapper, which is the grid item. */
  className?: string;
  horizontal?: boolean;
  delay?: number;
}) {
  return (
    <Reveal className={className} delay={delay}>
    <div
      className={clsx(
        'group h-full overflow-hidden rounded-2xl bg-white ring-1 ring-slate-900/[0.07] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.25)] hover:ring-slate-900/[0.12]',
        horizontal ? 'grid lg:grid-cols-2' : 'flex flex-col'
      )}
    >
      <div
        className={clsx(
          'relative flex items-center justify-center overflow-hidden bg-slate-50 p-6',
          horizontal ? 'min-h-[220px] lg:order-2' : 'h-[210px]'
        )}
      >
        {visual}
      </div>
      <div className={clsx('p-6', horizontal && 'flex flex-col justify-center lg:p-10')}>
        <h3 className="font-display text-[18px] font-semibold tracking-[-0.01em] text-slate-950">{title}</h3>
        <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">{body}</p>
      </div>
    </div>
    </Reveal>
  );
}

function Arrow({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ───────────── Bento visuals: miniatures of real screens ───────────── */

function AttentionVisual() {
  return (
    <div aria-hidden className="w-full max-w-md space-y-2 transition-transform duration-500 group-hover:-translate-y-1">
      <div className="overflow-hidden rounded-lg border border-red-200 bg-white shadow-sm">
        <div className="border-b border-red-100 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-800">
          2 shipments need attention
        </div>
        {[
          ['SM5544332211', 'Customs clearance delay'],
          ['SM7766554433', '2 days past promised delivery'],
        ].map(([awb, why]) => (
          <div key={awb} className="flex items-center gap-3 border-t border-red-50 px-3 py-2 first:border-t-0">
            <span className="font-mono text-[10.5px] font-semibold text-slate-900">{awb}</span>
            <span className="truncate text-[11px] text-red-900/70">{why}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 opacity-60">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="font-mono text-[10.5px] text-slate-500">SM9988776655</span>
        <span className="text-[11px] text-slate-400">Delivered · no action</span>
      </div>
    </div>
  );
}

function StatusesVisual() {
  const statuses = [
    ['Pending', 'bg-slate-400'],
    ['In Transit', 'bg-blue-500'],
    ['Out for Delivery', 'bg-amber-500'],
    ['Delivered', 'bg-emerald-500'],
    ['Exception', 'bg-red-500'],
  ];
  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      {statuses.map(([label, dot], i) => (
        <span
          key={label}
          style={{ transitionDelay: `${i * 40}ms` }}
          className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-slate-700 shadow-sm ring-1 ring-slate-900/[0.06] transition-transform duration-300 group-hover:translate-x-1"
        >
          <span className={clsx('h-1.5 w-1.5 rounded-full', dot)} />
          {label}
        </span>
      ))}
    </div>
  );
}

function NotesVisual() {
  return (
    <div aria-hidden className="w-full max-w-[260px] space-y-2">
      <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-[11px] shadow-sm ring-1 ring-slate-900/[0.06]">
        <span className="font-medium text-slate-700">Being followed up</span>
        <span className="flex h-4 w-7 items-center rounded-full bg-brand-700 p-0.5">
          <span className="ml-auto h-3 w-3 rounded-full bg-white" />
        </span>
      </div>
      <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-900/[0.06]">
        <p className="text-[11px] leading-snug text-slate-700">Called Delhi hub — docs re-submitted, expect release by 4pm.</p>
        <p className="mt-1.5 text-[10px] text-slate-400">Priya · 11:42</p>
      </div>
    </div>
  );
}

function WhatsAppVisual() {
  return (
    <div aria-hidden className="w-full max-w-[250px]">
      <div className="rounded-2xl rounded-tl-sm bg-[#dcf8c6] p-3 shadow-sm">
        <p className="text-[11px] font-semibold text-slate-900">ThinkHealth Logistics</p>
        <p className="mt-1 text-[11px] leading-snug text-slate-800">
          Shipment SM1234567890 is now <b>Out for Delivery</b>. Bengaluru Hub.
        </p>
        <p className="mt-1.5 truncate text-[10.5px] text-blue-700 underline">thinkhealth.in/track/SM1234567890</p>
        <p className="mt-1 text-right text-[9.5px] text-slate-500">09:14 ✓✓</p>
      </div>
    </div>
  );
}

function RatingVisual() {
  return (
    <div aria-hidden className="rounded-xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-900/[0.06]">
      <p className="text-[11px] font-medium text-slate-900">How was your delivery?</p>
      <div className="mt-2 flex justify-center gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <svg
            key={i}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            style={{ transitionDelay: `${i * 60}ms` }}
            className="fill-amber-400 stroke-amber-500 transition-transform duration-300 group-hover:scale-110"
            strokeWidth="1.5"
          >
            <path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z" strokeLinejoin="round" />
          </svg>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Sent automatically on delivery</p>
    </div>
  );
}

function AnalyticsVisual() {
  const bars = [
    ['bg-slate-400', 12],
    ['bg-blue-500', 30],
    ['bg-amber-500', 14],
    ['bg-emerald-500', 36],
    ['bg-red-500', 8],
  ] as const;
  return (
    <div aria-hidden className="w-full max-w-md space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          ['3.7 days', 'avg transit'],
          ['94%', 'on time'],
          ['4.7★', 'satisfaction'],
        ].map(([value, label]) => (
          <div key={label} className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-900/[0.06]">
            <p className="font-display text-[18px] font-semibold tracking-[-0.01em] text-slate-950">{value}</p>
            <p className="text-[10px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-900/[0.06]">
        <p className="text-[10px] font-medium text-slate-600">Where shipments are sitting</p>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full">
          {bars.map(([color, pct]) => (
            <span key={color} className={color} style={{ width: `${pct}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
