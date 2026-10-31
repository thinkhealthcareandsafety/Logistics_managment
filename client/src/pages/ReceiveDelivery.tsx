import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { apiClient } from '../api/client';
import { Skeleton, SkeletonRegion } from '../components/ui/Loading';
import { BrandMark } from '../components/ui/BrandMark';
import { EMPTY_DRAFT, ReceiptForm, relationLabel, type ReceiptDraft, type ReceiptSubmission } from '../components/receipt/ReceiptForm';
import { blobToDataUrl, dataUrlToBlob } from '../utils/image';

interface PublicReceipt {
  trackingNumber: string;
  carrierName: string;
  productName: string;
  quantity: number | null;
  customerName: string;
  deliverTo: string;
  shippingDate: string | null;
  confirmed: { receivedBy: string; relation: string; receivedAt: string } | null;
}

/** A submission kept on the phone until it can be sent - photos as data URLs. */
type Queued = Omit<ReceiptSubmission, 'photos' | 'signature'> & { photos: string[]; signature: string };

const queueKey = (t: string) => `th.receipt.queue.${t}`;
const draftKey = (t: string) => `th.receipt.draft.${t}`;
const RETRY_MS = 30_000;

function load<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function store(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

async function toFormData(s: Queued) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(s)) {
    if (k === 'photos' || k === 'signature' || k === 'location' || v == null) continue;
    fd.append(k, String(v));
  }
  if (s.location) {
    fd.append('lat', String(s.location.lat));
    fd.append('lng', String(s.location.lng));
    fd.append('accuracy', String(s.location.accuracy));
  }
  for (const [i, p] of s.photos.entries()) fd.append('photos', await dataUrlToBlob(p), `photo-${i + 1}.jpg`);
  fd.append('signature', await dataUrlToBlob(s.signature), 'signature.png');
  return fd;
}

/**
 * The delivery receipt, opened from the QR on the delivery slip or a shared link. Whoever
 * takes the parcel in - the client, the watchman, reception - gives their name, a photo
 * and a signature. No sign-in. With no internet, it's kept on the phone and sent by
 * itself when the connection is back.
 */
export function ReceiveDelivery() {
  const { token = '' } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-receipt', token],
    queryFn: () => apiClient.get<PublicReceipt>(`/public/receipts/${token}`).then((r) => r.data),
    // A wrong link stays wrong; anything else (busy, slow network) is worth retrying.
    retry: (n, err) => (err as { response?: { status?: number } })?.response?.status !== 404 && n < 3,
    retryDelay: (n) => 1500 * (n + 1),
    // Loaded once is enough - a failed background re-check must never replace the form.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const errorStatus = (error as { response?: { status?: number } } | null)?.response?.status;
  const [queued, setQueued] = useState<Queued | null>(() => load<Queued>(queueKey(token)));
  const [done, setDone] = useState<PublicReceipt['confirmed']>(null);
  const [sending, setSending] = useState(false);
  const [laterError, setLaterError] = useState('');

  /** Sends a saved receipt. Resolves true when it reached the server (or was already confirmed). */
  const send = useCallback(
    async (s: Queued) => {
      try {
        const res = await apiClient.post<{ confirmed: PublicReceipt['confirmed'] }>(`/public/receipts/${token}`, await toFormData(s), {
          timeout: 60_000,
        });
        store(queueKey(token), null);
        store(draftKey(token), null);
        setQueued(null);
        setDone(res.data.confirmed);
        return true;
      } catch (err) {
        const status = (err as { response?: { status?: number; data?: { message?: string } } }).response?.status;
        if (status === 409) {
          // Someone already confirmed it - nothing more to send.
          store(queueKey(token), null);
          setQueued(null);
          setDone({ receivedBy: s.receivedBy, relation: s.relation, receivedAt: s.receivedAt });
          return true;
        }
        if (status && status < 500) {
          store(queueKey(token), null);
          setQueued(null);
          throw new Error((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Could not submit');
        }
        return false; // no connection / server busy - keep it and try again
      }
    },
    [token]
  );

  // Keep trying a saved receipt: when the phone comes back online, and every 30 s.
  useEffect(() => {
    if (!queued) return;
    let stopped = false;
    const attempt = async () => {
      if (stopped || sending || !navigator.onLine) return;
      setSending(true);
      try {
        await send(queued);
      } catch (err) {
        // Refused when it finally went through - show why, with the form to try again.
        setLaterError((err as Error).message);
      } finally {
        setSending(false);
      }
    };
    attempt();
    window.addEventListener('online', attempt);
    const timer = window.setInterval(attempt, RETRY_MS);
    return () => {
      stopped = true;
      window.removeEventListener('online', attempt);
      window.clearInterval(timer);
    };
  }, [queued]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(sub: ReceiptSubmission) {
    const q: Queued = {
      ...sub,
      photos: await Promise.all(sub.photos.map(blobToDataUrl)),
      signature: await blobToDataUrl(sub.signature),
    };
    if (navigator.onLine && (await send(q))) return;
    // Offline (or the upload failed): keep it on this phone and send it later.
    if (!store(queueKey(token), q)) throw new Error('No internet, and this phone has no room to save it - please try again when online');
    setQueued(q);
  }

  const confirmed = done || data?.confirmed || null;
  const draft = load<ReceiptDraft>(draftKey(token)) || EMPTY_DRAFT;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center gap-2.5 px-4 py-3">
          <BrandMark size={32} />
          <div>
            <p className="text-[14px] font-semibold text-slate-900">Delivery receipt</p>
            <p className="text-[12px] text-slate-500">ThinkHealth · डिलीवरी की पुष्टि</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-5">
        {isLoading && !queued ? (
          <SkeletonRegion label="Loading the shipment">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="mt-4 h-64 w-full rounded-xl" />
          </SkeletonRegion>
        ) : confirmed ? (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <p className="text-[28px]" aria-hidden>✓</p>
            <h1 className="mt-1 text-[17px] font-semibold text-emerald-900">Delivery confirmed · पुष्टि हो गई</h1>
            <p className="mt-1 text-[14px] text-emerald-800">
              Received by {confirmed.receivedBy} ({relationLabel(confirmed.relation)})
              {confirmed.receivedAt && <> on {format(new Date(confirmed.receivedAt), 'd MMM yyyy, h:mm a')}</>}.
            </p>
            <p className="mt-2 text-[13px] text-emerald-700">Thank you - you can close this page.</p>
          </section>
        ) : queued ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
            <h1 className="text-[17px] font-semibold text-amber-900">Saved on this phone · फ़ोन में सेव हो गया</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-amber-900">
              There’s no internet right now. Your receipt is saved and will be sent by itself as soon as the connection is back - keep this
              page open, or open the same link again later.
            </p>
            <p className="mt-1 text-[13px] text-amber-800">इंटरनेट आते ही यह अपने-आप भेज दिया जाएगा।</p>
            <p className="mt-3 text-[12px] text-amber-700">{sending ? 'Sending…' : 'Waiting for internet…'}</p>
          </section>
        ) : !data ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 text-center">
            {errorStatus === 404 ? (
              <>
                <h1 className="text-[16px] font-semibold text-slate-900">This receipt link has been replaced</h1>
                <p className="mt-1 text-[14px] text-slate-600">Please ask ThinkHealth for the new link.</p>
              </>
            ) : (
              <>
                <h1 className="text-[16px] font-semibold text-slate-900">Couldn’t open the receipt just now</h1>
                <p className="mt-1 text-[14px] text-slate-600">
                  {errorStatus === 429 ? 'Too many tries in a short time - wait a few minutes,' : 'Check the internet,'} then try again.
                </p>
                <button type="button" onClick={() => window.location.reload()} className="btn-primary mt-4 h-9 px-4 py-0 text-[13px]">
                  Try again
                </button>
              </>
            )}
          </section>
        ) : (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[12px] text-slate-500">Shipment for · पार्सल</p>
              <p className="mt-0.5 text-[16px] font-semibold text-slate-900">{data.customerName || 'ThinkHealth customer'}</p>
              <p className="mt-1 text-[13px] text-slate-600">
                {data.productName}
                {data.quantity ? ` · ${data.quantity} unit${data.quantity === 1 ? '' : 's'}` : ''}
              </p>
              <p className="mt-1 text-[12px] tabular-nums text-slate-500">
                {data.carrierName} · AWB {data.trackingNumber}
                {data.deliverTo ? ` · ${data.deliverTo}` : ''}
              </p>
            </section>

            <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <h1 className="text-[16px] font-semibold text-slate-900">Confirm you received this parcel</h1>
              <p className="mt-0.5 text-[13px] text-slate-500">
                Anyone who takes it in can fill this - the client, security, reception or a colleague.
                <span className="block">पार्सल लेने वाला कोई भी व्यक्ति यह भर सकता है।</span>
              </p>
              {laterError && (
                <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
                  The saved receipt couldn’t be sent: {laterError}
                </p>
              )}
              <div className="mt-4">
                <ReceiptForm
                  bilingual
                  initial={draft}
                  onDraft={(d) => store(draftKey(token), d)}
                  onSubmit={submit}
                  submitLabel="Confirm delivery · पुष्टि करें"
                />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
