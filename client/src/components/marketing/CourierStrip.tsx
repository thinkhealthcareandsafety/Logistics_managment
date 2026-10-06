import { useCourierSummary } from '../../hooks/useCarriers';
import { Reveal } from './Reveal';

/** Used until the live numbers arrive (or if the API is unreachable) - never blank. */
const FALLBACK = {
  total: 1600,
  countries: 160,
  india: 53,
  featured: ['Shree Maruti Courier', 'Delhivery', 'Bluedart', 'DTDC', 'India Post', 'Ekart', 'XpressBees', 'Ecom Express', 'shadowfax'],
};

/** "1,691" from the live catalog, or "1,600+" before it loads. */
export function useCourierCount() {
  const { data } = useCourierSummary();
  return data ? data.total.toLocaleString('en-IN') : '1,600+';
}

/** Tidies TrackingMore's catalog names for display ("Bluedart" -> "Blue Dart"). */
function display(name: string) {
  const fixes: Record<string, string> = { bluedart: 'Blue Dart', shadowfax: 'Shadowfax', 'amazon-in': 'Amazon Shipping' };
  return fixes[name.toLowerCase()] ?? name;
}

/**
 * The couriers people already book with, named - real names from TrackingMore's live
 * catalog, plain text (no third-party logos on the marketing page).
 */
export function CourierStrip() {
  const { data } = useCourierSummary();
  const s = data ?? FALLBACK;
  const shown = s.featured.slice(0, 12).map(display);
  const rest = s.total - shown.length;

  return (
    <section aria-labelledby="couriers-heading" className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <Reveal>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-12">
            <div className="shrink-0 lg:w-72">
              <h2 id="couriers-heading" className="text-[15px] font-semibold text-slate-950">
                Works with the couriers you already book
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                {data ? s.total.toLocaleString('en-IN') : '1,600+'} couriers in {s.countries}+ countries through
                TrackingMore - {s.india} of them in India.
              </p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {shown.map((name) => (
                <li
                  key={name}
                  className="rounded-full bg-slate-50 px-3 py-1.5 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200"
                >
                  {name}
                </li>
              ))}
              <li className="rounded-full px-3 py-1.5 text-[13px] font-medium text-brand-800">
                + {rest.toLocaleString('en-IN')} more
              </li>
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
