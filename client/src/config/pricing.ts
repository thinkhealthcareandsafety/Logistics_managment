/**
 * ⚠️ PLACEHOLDER PRICING — REPLACE BEFORE YOU SELL.
 *
 * These numbers are illustrative, not researched against your costs or the Indian
 * market. Set `monthlyInr` from your own unit economics before this page goes public;
 * everything on the pricing section reads from here, so this is the only file to edit.
 *
 * The model is monthly shipment volume with a seat allowance, which is the usual shape
 * for B2B logistics tooling — the customer's cost should track the value they get
 * (parcels tracked), not how many people happen to log in.
 */

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  /** null = "talk to us" pricing rather than a published number. */
  monthlyInr: number | null;
  /** Monthly shipment ceiling - drives the "which plan fits me" slider. null = no cap. */
  maxShipments: number | null;
  shipmentsPerMonth: string;
  seats: string;
  features: string[];
  cta: string;
}

/**
 * The volume slider on the pricing section. The default lands on Growth, which is
 * where the recommendation starts before the visitor touches anything.
 */
export const VOLUME_SLIDER = { min: 50, max: 3000, step: 50, initial: 600 };

/** The cheapest plan whose ceiling covers the volume; the uncapped plan beyond that. */
export function recommendPlan(monthlyShipments: number): Plan {
  return (
    PLANS.find((p) => p.maxShipments !== null && monthlyShipments <= p.maxShipments) ??
    PLANS.find((p) => p.maxShipments === null)!
  );
}

/** Two months free on an annual commitment — the usual 12-for-10 SaaS discount. */
export const ANNUAL_MONTHS_CHARGED = 10;
export const ANNUAL_DISCOUNT_LABEL = '2 months free';

export const CURRENCY = '₹';

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For a single distribution point finding its feet.',
    monthlyInr: 2499,
    maxShipments: 250,
    shipmentsPerMonth: 'Up to 250 shipments',
    seats: '3 team members',
    features: [
      'Live tracking for 1,600+ couriers',
      'Attention-first dashboard',
      'Public tracking links for customers',
      'Email notifications',
      'CSV import and export',
    ],
    cta: 'Start with Starter',
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'For distributors running a real daily book.',
    monthlyInr: 6999,
    maxShipments: 1500,
    shipmentsPerMonth: 'Up to 1,500 shipments',
    seats: '10 team members',
    features: [
      'Everything in Starter',
      'WhatsApp notifications',
      'Delivery thank-you and feedback collection',
      'Operational analytics',
      'Ingest API and real-time webhooks',
      'Exception follow-up workflow',
    ],
    cta: 'Start with Growth',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For multi-site operations with their own systems.',
    monthlyInr: null,
    maxShipments: null,
    shipmentsPerMonth: 'Unlimited shipments',
    seats: 'Unlimited team members',
    features: [
      'Everything in Growth',
      'Couriers outside TrackingMore, integrated for you',
      'SSO and audit logging',
      'Dedicated onboarding',
      'Priority support with an SLA',
    ],
    cta: 'Talk to sales',
  },
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: 'Which couriers do you track?',
    a: 'Any courier on TrackingMore — more than 1,600 of them across 160 countries, including Shree Maruti, Delhivery, Blue Dart, DTDC, India Post, Ekart, XpressBees and Shadowfax. Pick the courier when you add an AWB (or put it in a CSV column) and every one of them gets the same five plain statuses, the same alerts and the same analytics, with a side-by-side courier comparison.',
  },
  {
    q: 'Do our customers need an account to track their order?',
    a: 'No. Every shipment gets a public tracking page at /track/<tracking number>, with no login and no personal details on the page. You can share the link, or we can send it automatically.',
  },
  {
    q: 'How do we get our shipments into the system?',
    a: 'Three ways, and you can mix them: add an AWB by hand, import a day of bookings from CSV, or have your order system POST to our ingest API the moment a consignment is booked. The API is idempotent, so retries are safe.',
  },
  {
    q: 'How quickly do statuses update?',
    a: 'A scheduler polls each courier on a loop and pushes every new checkpoint to any open dashboard over a live connection — you do not need to refresh. You can also force a full re-sync at any time.',
  },
  {
    q: 'Can we change plans later?',
    a: 'Yes, up or down, at any time. If you outgrow your shipment allowance we will tell you before it becomes a problem rather than silently cutting tracking off.',
  },
  {
    q: 'What happens to our data if we leave?',
    a: 'Export everything to CSV from the dashboard whenever you like, including while you are cancelling. Your shipment history is yours.',
  },
];
