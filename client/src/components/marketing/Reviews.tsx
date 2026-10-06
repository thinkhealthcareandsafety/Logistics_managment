import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { marketingApi, type PublicReview } from '../../api/marketing';
import { StarRating } from '../StarRating';

/** Seconds on screen per card - tuned so text is readable as it passes. */
const SECONDS_PER_CARD = 7;
/** Repeat the set until a half-track comfortably overflows a wide viewport. */
const MIN_CARDS_PER_HALF = 6;

/**
 * Real reviews only. These come from the feedback customers leave after delivery, and
 * a review reaches this page solely when the customer ticked the consent box AND the
 * ops team featured it. When there are none, the section renders nothing at all -
 * an empty "what our customers say" heading is worse than no section, and inventing
 * placeholder testimonials would be a lie told to prospects.
 */
export function Reviews() {
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['public-reviews'],
    queryFn: marketingApi.reviews,
    staleTime: 5 * 60_000,
  });

  if (isLoading || reviews.length === 0) return null;

  const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  // One half of the marquee. With only a couple of reviews the set repeats so the
  // track is still wider than the screen - otherwise there'd be a visible gap.
  const repeats = Math.max(1, Math.ceil(MIN_CARDS_PER_HALF / reviews.length));
  const half = Array.from({ length: repeats }).flatMap(() => reviews);
  const duration = `${half.length * SECONDS_PER_CARD}s`;

  return (
    <section id="reviews" className="scroll-mt-16 overflow-hidden py-24 lg:py-32">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-12 lg:items-end lg:gap-10">
        <div className="lg:col-span-7">
          <p className="flex items-center gap-3 text-[13px] font-medium">
            <span className="font-mono text-slate-400">—</span>
            <span aria-hidden className="h-px w-6 bg-slate-300" />
            <span className="text-slate-900">From customers</span>
          </p>
          <h2 className="mt-5 font-display text-[34px] font-semibold leading-[1.06] tracking-[-0.025em] text-slate-950 sm:text-[46px]">
            What they said once the parcel landed.
          </h2>
        </div>
        <div className="lg:col-span-5 lg:pb-2">
          <div className="flex items-center gap-4">
            <span className="font-display text-[44px] font-semibold leading-none tracking-[-0.03em] text-slate-950">
              {average.toFixed(1)}
            </span>
            <div>
              <StarRating value={Math.round(average)} size="sm" />
              <p className="mt-1 text-[13px] text-slate-500">
                from {reviews.length} verified {reviews.length === 1 ? 'review' : 'reviews'}
              </p>
            </div>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-slate-500">
            Collected automatically on delivery and published only with the customer’s permission.
          </p>
        </div>
      </div>

      {/* Edge masks so cards dissolve at the rim instead of being guillotined. */}
      <div
        className="relative mt-14 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
      >
        <div
          className="marquee-track flex w-max gap-6 px-3"
          style={{ ['--marquee-duration' as string]: duration }}
        >
          {half.map((review, i) => (
            <ReviewCard key={`a-${review.id}-${i}`} review={review} />
          ))}
          {/* The second half is the same content again purely to make the wrap
              seamless, so it's hidden from assistive tech. */}
          {half.map((review, i) => (
            <ReviewCard key={`b-${review.id}-${i}`} review={review} ariaHidden />
          ))}
        </div>
      </div>

    </section>
  );
}

function ReviewCard({ review, ariaHidden }: { review: PublicReview; ariaHidden?: boolean }) {
  const initials = review.customerName
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <figure
      aria-hidden={ariaHidden}
      className="flex w-[360px] shrink-0 flex-col rounded-2xl bg-slate-50 p-7 ring-1 ring-slate-900/[0.05]"
    >
      <StarRating value={review.rating} size="sm" />
      <blockquote className="mt-4 flex-1 text-[15.5px] leading-relaxed text-slate-800">“{review.comment}”</blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-900 text-[12px] font-semibold text-white">
          {initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-medium text-slate-900">{review.customerName}</span>
          <span className="block text-[12px] text-slate-500">{format(new Date(review.submittedAt), 'MMMM yyyy')}</span>
        </span>
      </figcaption>
    </figure>
  );
}
