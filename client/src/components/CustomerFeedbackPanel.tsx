import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { feedbackApi } from '../api/feedback';
import { StarRating } from './StarRating';
import type { Shipment } from '../types/shipment';
import { Skeleton, SkeletonRegion, Spinner } from './ui/Loading';

/**
 * Dashboard-side view of the customer's rating, plus the state of the thank-you
 * message we send on delivery. Only shown for delivered shipments - there's nothing
 * to say about feedback on a parcel that hasn't arrived.
 */
export function CustomerFeedbackPanel({ shipment }: { shipment: Shipment }) {
  const queryClient = useQueryClient();
  const queryKey = ['shipment-feedback', shipment._id];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => feedbackApi.forShipment(shipment._id),
  });

  const resend = useMutation({
    mutationFn: () => feedbackApi.resendDeliveryNotice(shipment._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Feedback request sent to the customer');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Could not send the request'),
  });

  const publish = useMutation({
    mutationFn: (isPublished: boolean) => feedbackApi.setPublished(shipment._id, isPublished),
    onSuccess: ({ isPublished }) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['public-reviews'] });
      toast.success(isPublished ? 'Review featured on the website' : 'Review removed from the website');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Could not update the review'),
  });

  const email = shipment.customerInfo?.email;
  const phone = shipment.customerInfo?.phone;
  const hasContact = !!(email || phone);
  const feedback = data?.feedback;
  const channels = data?.channels ?? { email: false, whatsapp: false };
  // A channel only counts if it's connected AND this customer has that contact detail.
  const reachableBy = [channels.email && email && 'email', channels.whatsapp && phone && 'WhatsApp'].filter(
    Boolean
  ) as string[];
  const canSend = hasContact && reachableBy.length > 0;
  const feedbackUrl = `${window.location.origin}/feedback/${encodeURIComponent(shipment.trackingNumber)}`;

  function copyLink() {
    navigator.clipboard.writeText(feedbackUrl).then(
      () => toast.success('Feedback link copied'),
      () => toast.error('Could not copy the link')
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-950">Customer feedback</h2>
        <div className="flex flex-wrap items-center gap-1">
          <a
            href={feedbackUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-2 py-1 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Preview form
          </a>
          <button
            onClick={copyLink}
            className="rounded-md px-2 py-1 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Copy link
          </button>
          {canSend && (
            <button
              onClick={() => resend.mutate()}
              disabled={resend.isPending} aria-busy={resend.isPending}
              className="rounded-md px-2 py-1 text-[13px] font-medium text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
            >
              {resend.isPending && <Spinner className="h-3.5 w-3.5" />}
              {resend.isPending ? 'Sending…' : data?.deliveryNoticeSentAt ? 'Send again' : 'Send now'}
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <SkeletonRegion label="Loading customer feedback" className="mt-4 space-y-2.5">
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-4 w-4 rounded-sm" />
            ))}
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </SkeletonRegion>
      )}

      {!isLoading && feedback && (
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <StarRating value={feedback.rating} size="sm" />
            <span className="text-sm font-semibold text-slate-900">{feedback.rating}/5</span>
          </div>
          {feedback.comment ? (
            <blockquote className="mt-3 border-l-2 border-slate-200 pl-3 text-sm leading-relaxed text-slate-700">
              “{feedback.comment}”
            </blockquote>
          ) : (
            <p className="mt-3 text-[13px] text-slate-400">No written comment.</p>
          )}
          <p className="mt-3 text-xs text-slate-400">
            {feedback.customerName ? `${feedback.customerName} · ` : ''}
            {format(new Date(feedback.submittedAt), 'd MMM yyyy')}
          </p>

          {/* Featuring is gated on the customer's own consent, not just our choice. */}
          <div className="mt-4 border-t border-slate-100 pt-3">
            {feedback.consentToPublish ? (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={feedback.isPublished}
                  disabled={publish.isPending || !feedback.comment} aria-busy={publish.isPending}
                  onChange={(e) => publish.mutate(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-800 disabled:cursor-not-allowed"
                />
                <span className="text-[13px] leading-relaxed text-slate-600">
                  Feature this review on the public website
                  {!feedback.comment && (
                    <span className="mt-0.5 block text-xs text-slate-400">
                      Needs a written comment — a bare star rating has nothing to quote.
                    </span>
                  )}
                </span>
              </label>
            ) : (
              <p className="text-[13px] leading-relaxed text-slate-400">
                This customer didn’t agree to have their review published, so it can’t be featured on the website.
              </p>
            )}
          </div>
        </div>
      )}

      {!isLoading && !feedback && (
        <div className="mt-4">
          <AutomationStatus
            state={
              !hasContact
                ? 'no-contact'
                : data?.deliveryNoticeSentAt
                  ? 'sent'
                  : canSend
                    ? 'retrying'
                    : 'not-connected'
            }
            sentAt={data?.deliveryNoticeSentAt ?? null}
            reachableBy={reachableBy}
            email={email}
            phone={phone}
            retryWindowDays={data?.retryWindowDays ?? 7}
          />
        </div>
      )}
    </section>
  );
}

/**
 * The thank-you + feedback request is fully automatic: it goes out when the shipment
 * is marked delivered, and is retried every refresh cycle until it does. This explains
 * where that automation stands for this one shipment.
 */
function AutomationStatus({
  state,
  sentAt,
  reachableBy,
  email,
  phone,
  retryWindowDays,
}: {
  state: 'sent' | 'retrying' | 'not-connected' | 'no-contact';
  sentAt: string | null;
  reachableBy: string[];
  email?: string;
  phone?: string;
  retryWindowDays: number;
}) {
  const tone = {
    sent: { dot: 'bg-emerald-500', box: 'bg-emerald-50/60 ring-emerald-100', title: 'text-emerald-900' },
    retrying: { dot: 'bg-brand-500', box: 'bg-brand-50/60 ring-brand-100', title: 'text-brand-900' },
    'not-connected': { dot: 'bg-amber-500', box: 'bg-amber-50/70 ring-amber-200', title: 'text-amber-900' },
    'no-contact': { dot: 'bg-slate-400', box: 'bg-slate-50 ring-slate-200', title: 'text-slate-800' },
  }[state];

  const to = [email && `email (${email})`, phone && `WhatsApp (${phone})`].filter(Boolean).join(' and ');

  return (
    <div className={clsx('rounded-lg px-3.5 py-3 text-[13px] leading-relaxed ring-1 ring-inset', tone.box)}>
      <p className={clsx('flex items-center gap-2 font-semibold', tone.title)}>
        <span aria-hidden className={clsx('h-1.5 w-1.5 rounded-full', tone.dot)} />
        {state === 'sent' && 'Sent automatically - waiting for the customer'}
        {state === 'retrying' && 'Sending automatically'}
        {state === 'not-connected' && 'Automatic - waiting for email / WhatsApp to be connected'}
        {state === 'no-contact' && 'Can’t be sent - no customer contact'}
      </p>
      <p className="mt-1 text-slate-600">
        {state === 'sent' && sentAt && (
          <>
            The thank-you and feedback link went out {format(new Date(sentAt), 'd MMM yyyy · h:mm a')} by{' '}
            {reachableBy.join(' and ') || 'the connected channels'}. Their rating will appear here.
          </>
        )}
        {state === 'retrying' && (
          <>
            Going out by {reachableBy.join(' and ')}. If the first attempt didn’t get through it retries every 15 minutes
            for {retryWindowDays} days after delivery.
          </>
        )}
        {state === 'not-connected' && (
          <>
            A thank-you with the feedback link is sent to the customer by {to} as soon as a shipment is delivered.
            Email and WhatsApp sending aren’t connected on the server yet, so nothing has gone out - it’ll send on its
            own once they are (within {retryWindowDays} days of delivery). Until then, use <strong>Copy link</strong>.
          </>
        )}
        {state === 'no-contact' && (
          <>Add the customer’s email or phone to the shipment and the request will go out automatically.</>
        )}
      </p>
    </div>
  );
}
