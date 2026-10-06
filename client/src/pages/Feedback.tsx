import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { feedbackApi } from '../api/feedback';
import { StarRating } from '../components/StarRating';
import { STATUS_LABELS } from '../utils/status';

/**
 * Public feedback form, reached from the "thank you for choosing ThinkHealth" message
 * we send the customer on delivery. No login - the tracking number in the URL is the
 * credential, same model as the tracking page.
 */
export function Feedback() {
  const { trackingNumber } = useParams<{ trackingNumber: string }>();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [consentToPublish, setConsentToPublish] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-feedback', trackingNumber],
    queryFn: () => feedbackApi.getPublic(trackingNumber as string),
    enabled: !!trackingNumber,
    retry: false,
  });

  // Coming back to edit an answer should show what they said last time, not a blank form.
  useEffect(() => {
    if (data?.feedback) {
      setRating(data.feedback.rating);
      setComment(data.feedback.comment);
      setConsentToPublish(data.feedback.consentToPublish);
    }
  }, [data?.feedback]);

  const submit = useMutation({
    mutationFn: () => feedbackApi.submit(trackingNumber as string, { rating, comment, consentToPublish }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-feedback', trackingNumber] });
      toast.success('Thank you — your feedback has been recorded.');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Could not save your feedback'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rating) {
      toast.error('Please choose a star rating first');
      return;
    }
    submit.mutate();
  }

  const alreadySubmitted = !!data?.feedback;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center gap-2.5 px-4 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-900 text-sm font-bold text-white">
              TH
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-slate-900">ThinkHealth</span>
              <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-400">Logistics</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-10">
        {isLoading && <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />}

        {isError && (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-card">
            <h1 className="text-lg font-semibold text-slate-900">We couldn’t find that order</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              Nothing is tracking under <span className="font-mono text-slate-700">{trackingNumber}</span>. Please
              check the link in your message.
            </p>
          </div>
        )}

        {data && !data.isDelivered && (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-card">
            <h1 className="text-lg font-semibold text-slate-900">Your order is still on its way</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              {data.trackingNumber} is currently <strong>{STATUS_LABELS[data.status]}</strong>. We’ll ask for your
              feedback once it’s been delivered.
            </p>
            <Link
              to={`/track/${encodeURIComponent(data.trackingNumber)}`}
              className="mt-6 inline-block rounded-xl bg-brand-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              Track this order
            </Link>
          </div>
        )}

        {data && data.isDelivered && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-card">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" aria-hidden>
                  <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h1 className="mt-3 text-xl font-semibold text-slate-900">Thank you for choosing ThinkHealth</h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Order <span className="font-mono text-slate-700">{data.trackingNumber}</span>
                {data.productName ? ` · ${data.productName}` : ''} was delivered
                {data.deliveredAt ? ` on ${format(new Date(data.deliveredAt), 'd MMM yyyy')}` : ''}.
              </p>
            </section>

            <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              {alreadySubmitted && (
                <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
                  You rated this order on {format(new Date(data.feedback!.submittedAt), 'd MMM yyyy')}. You can change
                  your answer below.
                </p>
              )}

              <h2 className="text-base font-semibold text-slate-900">How was your delivery?</h2>
              <p className="mt-1 text-[13px] text-slate-500">It takes under a minute and it genuinely helps us.</p>

              <div className="mt-4">
                <StarRating value={rating} onChange={setRating} size="lg" />
              </div>

              <label className="mt-5 block">
                <span className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Anything you’d like to add? <span className="font-normal text-slate-400">Optional</span>
                </span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Packaging, delivery time, the courier, anything at all…"
                  className="input resize-y"
                />
              </label>

              {/* Explicit, opt-in, and unticked by default - nobody's words go on our
                  marketing site unless they say so. */}
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={consentToPublish}
                  onChange={(e) => setConsentToPublish(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                />
                <span className="text-[13px] leading-relaxed text-slate-600">
                  ThinkHealth may publish this review, with my name, on their website.
                  <span className="mt-0.5 block text-xs text-slate-400">
                    Optional. Leave it unticked and your feedback stays private to the team.
                  </span>
                </span>
              </label>

              <button
                type="submit"
                disabled={submit.isPending}
                className="mt-4 w-full rounded-xl bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submit.isPending ? 'Sending…' : alreadySubmitted ? 'Update my feedback' : 'Send feedback'}
              </button>
            </form>

            <p className="text-center text-[13px] text-slate-500">
              Want the delivery details again?{' '}
              <Link
                to={`/track/${encodeURIComponent(data.trackingNumber)}`}
                className="font-medium text-brand-700 hover:text-brand-900"
              >
                View your tracking page
              </Link>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
