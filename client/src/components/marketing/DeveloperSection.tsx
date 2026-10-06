import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { SectionMark } from './SectionMark';

const SNIPPETS = {
  ingest: {
    file: 'POST /api/ingest/shipments',
    code: `curl -X POST https://thinkhealth.in/api/ingest/shipments \\
  -H "X-Ingest-Key: $THINKHEALTH_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "trackingNumber": "26043200315540",
    "carrierCode": "delhivery",
    "productDetails": { "name": "Nitrile Gloves (M)", "quantity": 40 },
    "estimatedDelivery": "2026-10-02"
  }'

// 201 Created on first push, 200 on a retry - it's idempotent`,
  },
  realtime: {
    file: 'dashboard.ts',
    code: `socket.on('shipment:updated', (shipment) => {
  shipment.status          // 'out_for_delivery'
  shipment.currentLocation // 'Bengaluru Hub'
  shipment.checkpoints     // full normalised history
});

// Or hand the customer the no-login page
const url = \`https://thinkhealth.in/track/\${awb}\``,
  },
} as const;

type Tab = keyof typeof SNIPPETS;

const POINTS = [
  ['Idempotent ingest', 'Retries from your order system never create duplicates.'],
  ['Any courier', 'Send a TrackingMore courier code - 1,600+ supported, Shree Maruti by default.'],
  ['Push, not poll', 'Every new checkpoint arrives over an authenticated socket.'],
  ['Public tracking pages', 'A no-login URL per shipment, safe to hand to anyone.'],
];

/**
 * The page's one dark section - a deliberate change of register for the technical
 * buyer, and the thing that breaks the white-page rhythm.
 */
export function DeveloperSection() {
  const [tab, setTab] = useState<Tab>('ingest');

  return (
    <section id="developer" className="relative scroll-mt-16 overflow-hidden bg-brand-950">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_60%_70%_at_70%_50%,black,transparent)]"
      />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-14 px-5 py-24 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:py-32">
        <div className="min-w-0 lg:col-span-5">
          <SectionMark index="03" label="Developer" dark />
          <h2 className="mt-5 font-display text-[34px] font-semibold leading-[1.06] tracking-[-0.025em] text-white sm:text-[46px]">
            Two endpoints. That’s the integration.
          </h2>
          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-brand-100/70">
            Your order system pushes a booked AWB in. Every status change pushes back out. No polling loops to
            write, no carrier SDK to learn.
          </p>
          <dl className="mt-10 space-y-5">
            {POINTS.map(([title, body]) => (
              <div key={title} className="flex gap-4">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" aria-hidden />
                <div>
                  <dt className="text-[15px] font-medium text-white">{title}</dt>
                  <dd className="mt-0.5 text-[14px] text-brand-100/60">{body}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <div className="min-w-0 lg:col-span-7 lg:self-center">
          <div className="overflow-hidden rounded-2xl bg-[#07232a] shadow-2xl ring-1 ring-white/10">
            <div className="flex items-center justify-between border-b border-white/10 px-2">
              <div role="tablist" aria-label="Code example" className="flex">
                {(Object.keys(SNIPPETS) as Tab[]).map((key) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={clsx(
                      'relative px-4 py-3.5 text-[13px] font-medium transition',
                      tab === key ? 'text-white' : 'text-white/40 hover:text-white/70'
                    )}
                  >
                    {key === 'ingest' ? 'Ingest' : 'Real-time'}
                    {tab === key && <span className="absolute inset-x-3 -bottom-px h-px bg-brand-300" />}
                  </button>
                ))}
              </div>
              <span className="hidden px-3 font-mono text-[11px] text-white/30 sm:block">{SNIPPETS[tab].file}</span>
            </div>
            <pre className="scrollbar-thin overflow-x-auto p-6 font-mono text-[12.5px] leading-[1.75] text-slate-300">
              <code>{highlight(SNIPPETS[tab].code)}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Tiny highlighter for the two fixed snippets above - comments, strings, and the few
 * keywords that appear. Not a general tokenizer and doesn't need to be.
 */
function highlight(code: string): ReactNode[] {
  return code.split('\n').map((line, lineIndex) => {
    // A comment is `//` at the start of a line or after whitespace - not the `//`
    // inside `https://`, which would otherwise grey out the rest of the URL.
    const commentMatch = /(^|\s)\/\//.exec(line);
    const commentAt = commentMatch ? commentMatch.index + commentMatch[1].length : -1;
    const body = commentAt >= 0 ? line.slice(0, commentAt) : line;
    const comment = commentAt >= 0 ? line.slice(commentAt) : '';

    const parts: ReactNode[] = [];
    const tokenRe = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:curl|const|POST)\b|-[HXd]\b|\b\d+\b)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(body))) {
      if (match.index > last) parts.push(body.slice(last, match.index));
      const token = match[0];
      const color = /^["'`]/.test(token)
        ? 'text-emerald-300'
        : /^\d+$/.test(token)
          ? 'text-amber-300'
          : /^-/.test(token)
            ? 'text-brand-300'
            : 'text-sky-300';
      parts.push(
        <span key={`${lineIndex}-${match.index}`} className={color}>
          {token}
        </span>
      );
      last = match.index + token.length;
    }
    if (last < body.length) parts.push(body.slice(last));
    if (comment) {
      parts.push(
        <span key={`${lineIndex}-c`} className="text-slate-500">
          {comment}
        </span>
      );
    }
    return (
      <span key={lineIndex} className="block">
        {parts.length ? parts : ' '}
      </span>
    );
  });
}
