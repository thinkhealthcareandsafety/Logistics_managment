import { FAQS } from '../../config/pricing';

/**
 * Buying objections, answered on the page. Native <details> so it works without JS,
 * is keyboard-accessible for free, and is findable by in-page search.
 */
export function FAQ() {
  return (
    <div className="border-t border-slate-200">
      {FAQS.map((item) => (
        <details key={item.q} className="group border-b border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-left [&::-webkit-details-marker]:hidden">
            <span className="font-display text-[18px] font-medium tracking-[-0.005em] text-slate-950">{item.q}</span>
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-slate-200 transition group-open:rotate-45 group-open:bg-slate-950 group-open:ring-slate-950"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="2"
                className="stroke-slate-600 group-open:stroke-white"
              >
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </span>
          </summary>
          <p className="-mt-1 max-w-2xl pb-7 pr-14 text-[15px] leading-relaxed text-slate-600">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
