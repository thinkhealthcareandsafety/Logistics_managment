import clsx from 'clsx';

const LABELS = ['', 'Poor', 'Not great', 'Fine', 'Good', 'Excellent'];

/**
 * Interactive when `onChange` is given, read-only display otherwise. Rendered as
 * radio inputs rather than buttons so it's keyboard- and screen-reader-navigable
 * as a single "rating" control instead of five unrelated buttons.
 */
export function StarRating({
  value,
  onChange,
  size = 'md',
}: {
  value: number;
  onChange?: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const px = size === 'lg' ? 40 : size === 'md' ? 26 : 16;

  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} size={px} filled={star <= value} />
        ))}
      </span>
    );
  }

  return (
    <div>
      <fieldset className="flex items-center gap-1">
        <legend className="sr-only">Your rating</legend>
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            className="group cursor-pointer rounded p-0.5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-600"
            title={LABELS[star]}
          >
            <input
              type="radio"
              name="rating"
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="sr-only"
            />
            <Star size={px} filled={star <= value} interactive />
          </label>
        ))}
      </fieldset>
      <p className={clsx('mt-1.5 text-sm font-medium', value ? 'text-slate-700' : 'text-slate-400')}>
        {value ? LABELS[value] : 'Tap a star to rate'}
      </p>
    </div>
  );
}

function Star({ size, filled, interactive }: { size: number; filled: boolean; interactive?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className={clsx(
        'transition',
        filled ? 'fill-amber-400 stroke-amber-500' : 'fill-slate-100 stroke-slate-300',
        interactive && 'group-hover:scale-110 group-hover:stroke-amber-500'
      )}
      strokeWidth="1.5"
    >
      <path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z" strokeLinejoin="round" />
    </svg>
  );
}
