import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';
import type { Shipment } from '../../types/shipment';
import { Modal } from '../Modal';
import { Spinner } from '../ui/Loading';
import { ReceiptForm, conditionLabel, relationLabel, type ReceiptSubmission } from './ReceiptForm';

interface ReceiptInfo {
  link: string;
  receipt: {
    receivedBy: string;
    relation: string;
    relationNote: string;
    phone: string;
    condition: 'good' | 'damaged' | 'partial';
    remarks: string;
    receivedAt: string;
    confirmedAt: string;
    photoCount: number;
    location: { lat: number; lng: number; accuracy: number | null } | null;
    via: 'link' | 'staff';
    recordedByName: string;
  } | null;
}

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/** wa.me to the customer's own number, from your own WhatsApp - free, nothing automated. */
function whatsappToCustomer(phone: string | undefined, text: string) {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

function toFormData(s: ReceiptSubmission) {
  const fd = new FormData();
  for (const k of ['receivedBy', 'relation', 'relationNote', 'phone', 'condition', 'remarks', 'receivedAt'] as const) fd.append(k, String(s[k] ?? ''));
  if (s.location) {
    fd.append('lat', String(s.location.lat));
    fd.append('lng', String(s.location.lng));
  }
  s.photos.forEach((p, i) => fd.append('photos', p, `photo-${i + 1}.jpg`));
  fd.append('signature', s.signature, 'signature.png');
  return fd;
}

/** A receipt picture, fetched with the staff session (the endpoint needs sign-in). */
function ReceiptImage({ shipmentId, n, alt, className }: { shipmentId: string; n: string; alt: string; className: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let revoke = '';
    apiClient
      .get<Blob>(`/shipments/${shipmentId}/receipt/image`, { params: { n }, responseType: 'blob' })
      .then((r) => {
        revoke = URL.createObjectURL(r.data);
        setUrl(revoke);
      })
      .catch(() => setUrl(''));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [shipmentId, n]);
  if (!url) return <div className={clsx(className, 'shimmer bg-slate-100')} aria-label={`Loading ${alt}`} />;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open full size">
      <img src={url} alt={alt} className={className} />
    </a>
  );
}

/**
 * One switch for every shipment: whether the automatic "Delivered" thank-you also
 * carries the receipt link. Same single message - never an extra one. Off by default.
 */
function InDeliveredMessageSwitch({ shipmentId }: { shipmentId: string }) {
  const queryClient = useQueryClient();
  const [previewing, setPreviewing] = useState(false);
  const { data } = useQuery({
    queryKey: ['receipt-settings'],
    queryFn: () => apiClient.get<{ inDeliveredMessage: boolean; whatsappPaused: boolean }>('/shipments/receipt-settings').then((r) => r.data),
  });
  const toggle = useMutation({
    mutationFn: (on: boolean) => apiClient.patch('/shipments/receipt-settings', { inDeliveredMessage: on }).then((r) => r.data),
    onSuccess: (d) => {
      queryClient.setQueryData(['receipt-settings'], d);
      toast.success(d.inDeliveredMessage ? 'Receipt link will ride in the Delivered message' : 'Receipt link removed from the Delivered message');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not change the setting')),
  });
  if (!data) return null;
  const on = data.inDeliveredMessage;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Add the receipt link to the Delivered message"
        disabled={toggle.isPending}
        onClick={() => toggle.mutate(!on)}
        className={clsx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition disabled:opacity-60', on ? 'bg-brand-600' : 'bg-slate-300')}
      >
        <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
      </button>
      <div className="text-[12px] leading-relaxed">
        <p className="font-medium text-slate-800">Add this link to the automatic “Delivered” message</p>
        <p className="text-slate-500">
          {on
            ? 'On - the thank-you + feedback message also asks the client to confirm receipt. Still one message, no extra cost.'
            : 'Off - clients get nothing new. Turn on to ask for the receipt in the same thank-you + feedback message.'}
          {data.whatsappPaused && ' WhatsApp is paused, so nothing goes out on WhatsApp either way.'}
        </p>
        <button type="button" onClick={() => setPreviewing(true)} className="mt-1 font-medium text-brand-700 hover:text-brand-900">
          Preview what the client gets →
        </button>
      </div>
      {previewing && <DeliveredPreview shipmentId={shipmentId} onClose={() => setPreviewing(false)} />}
    </div>
  );
}

/** WhatsApp's *bold* and bare links, on escaped text. */
function whatsappHtml(text: string) {
  const esc = text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return esc
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer" style="color:#027eb5;word-break:break-all">$1</a>');
}

/** The "Delivered" WhatsApp and email exactly as the server would build them. Sends nothing. */
function DeliveredPreview({ shipmentId, onClose }: { shipmentId: string; onClose: () => void }) {
  const [tab, setTab] = useState<'whatsapp' | 'email'>('whatsapp');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['delivered-preview', shipmentId],
    queryFn: () =>
      apiClient
        .get<{ receiptUrl: string; feedbackUrl: string; whatsapp: string; email: { subject: string; html: string } }>(
          `/shipments/${shipmentId}/receipt/delivered-preview`
        )
        .then((r) => r.data),
  });
  return (
    <Modal size="lg" title="What the client gets on delivery" description="Preview only - nothing is sent." onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <p className="text-[13px] text-red-700">Could not build the preview.</p>
      ) : (
        <div className="space-y-4 text-[13px]">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(['whatsapp', 'email'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={clsx('flex-1 rounded-md px-3 py-1.5 font-medium transition', tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
              >
                {t === 'whatsapp' ? 'WhatsApp' : 'Email'}
              </button>
            ))}
          </div>

          {tab === 'whatsapp' ? (
            <div className="rounded-xl bg-[#efeae2] p-4">
              <div
                className="max-w-[420px] whitespace-pre-wrap rounded-lg rounded-tl-none bg-white px-3 py-2 text-[14px] leading-snug text-[#111b21] shadow-sm"
                dangerouslySetInnerHTML={{ __html: whatsappHtml(data.whatsapp) }}
              />
              <p className="mt-2 text-[11px] text-slate-500">
                Until Meta approves the new template, WhatsApp sends your current approved thank-you instead (without the receipt line).
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-[12px] text-slate-500">
                Subject: <span className="font-medium text-slate-800">{data.email.subject}</span>
              </p>
              <div className="rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: data.email.html }} />
            </div>
          )}

          <p className="text-[12px] text-slate-500">
            Want to see the pages the links open?{' '}
            <a href={data.receiptUrl} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:text-brand-900">
              Receipt form
            </a>{' '}
            (look only - submitting it records a real receipt) ·{' '}
            <a href={data.feedbackUrl} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:text-brand-900">
              Feedback form
            </a>
          </p>
        </div>
      )}
    </Modal>
  );
}

/**
 * Proof of delivery on the shipment page: who received it, their photo and signature -
 * or, until then, the ways to get it: the delivery slip with its QR (in the box), the
 * link to send from your own WhatsApp, or recording it here from what the client sent.
 */
export function DeliveryReceiptCard({ shipment }: { shipment: Shipment }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['receipt', shipment._id],
    queryFn: () => apiClient.get<ReceiptInfo>(`/shipments/${shipment._id}/receipt`).then((r) => r.data),
  });
  const [recording, setRecording] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['receipt', shipment._id] });
    queryClient.invalidateQueries({ queryKey: ['shipment', shipment._id] });
    queryClient.invalidateQueries({ queryKey: ['shipments'] });
  };

  const reset = useMutation({
    mutationFn: () => apiClient.delete(`/shipments/${shipment._id}/receipt`),
    onSuccess: () => {
      toast.success('Receipt removed - share the new link to collect it again');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not remove the receipt')),
  });

  const r = data?.receipt;
  const message = data
    ? `Hello${shipment.customerInfo?.name ? ` ${shipment.customerInfo.name}` : ''}, please confirm you received your ThinkHealth shipment (AWB ${shipment.trackingNumber}). Whoever receives the parcel - you, security or reception - can open this link, add a photo and sign: ${data.link}`
    : '';

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="text-[15px] font-semibold text-slate-950">Delivery receipt</h2>
        {r ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] font-medium text-emerald-700">Confirmed</span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-medium text-slate-600">Waiting</span>
        )}
      </div>

      <div className="p-5 text-[13px]">
        {isLoading || !data ? (
          <Spinner />
        ) : r ? (
          <div className="space-y-4">
            <div>
              <p className="text-[15px] font-semibold text-slate-900">
                {r.receivedBy}
                <span className="ml-2 text-[13px] font-normal text-slate-500">
                  {relationLabel(r.relation)}
                  {r.relationNote ? ` · ${r.relationNote}` : ''}
                </span>
              </p>
              <p className="mt-0.5 text-slate-600">
                Received {format(new Date(r.receivedAt), 'd MMM yyyy, h:mm a')}
                {r.phone && <> · {r.phone}</>}
              </p>
              <p className={clsx('mt-1 font-medium', r.condition === 'good' ? 'text-emerald-700' : 'text-red-700')}>
                {conditionLabel(r.condition)}
                {r.remarks && <span className="font-normal text-slate-700"> - {r.remarks}</span>}
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {Array.from({ length: r.photoCount }, (_, i) => (
                <ReceiptImage key={i} shipmentId={shipment._id} n={String(i)} alt={`Receipt photo ${i + 1}`} className="h-28 w-28 rounded-lg border border-slate-200 object-cover" />
              ))}
              <div>
                <p className="mb-1 text-[12px] text-slate-500">Signature</p>
                <ReceiptImage shipmentId={shipment._id} n="signature" alt="Receiver's signature" className="h-20 w-48 rounded-lg border border-slate-200 bg-white object-contain" />
              </div>
            </div>

            <p className="text-[12px] text-slate-500">
              {r.via === 'link' ? 'Confirmed by the receiver on the receipt link' : `Recorded by ${r.recordedByName || 'staff'}`} ·{' '}
              {format(new Date(r.confirmedAt), 'd MMM yyyy, h:mm a')}
              {r.location && (
                <>
                  {' · '}
                  <a
                    href={`https://www.google.com/maps?q=${r.location.lat},${r.location.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-brand-700 hover:text-brand-900"
                  >
                    Where it was signed
                  </a>
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => window.confirm('Remove this receipt? The old link stops working and a new one is made.') && reset.mutate()}
              className="text-[12px] font-medium text-slate-500 hover:text-red-700"
            >
              Remove receipt (wrong person or photo)
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="leading-relaxed text-slate-600">
              Whoever receives the parcel - the client, security, reception or a colleague - confirms it with their name, a photo and a signature on
              their own phone. No app or sign-in, and it saves itself if their internet is off.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to={`/shipments/${shipment._id}/slip`} target="_blank" className="btn-primary inline-flex h-8 items-center px-3 py-0 text-[13px]">
                Print QR sticker
              </Link>
              <a
                href={whatsappToCustomer(shipment.customerInfo?.phone, message)}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary inline-flex h-8 items-center px-3 py-0 text-[13px]"
                title="Opens your own WhatsApp with the message ready - nothing is sent automatically"
              >
                Send link on WhatsApp
              </a>
              <button
                type="button"
                className="btn-secondary h-8 px-3 py-0 text-[13px]"
                onClick={() =>
                  navigator.clipboard.writeText(data.link).then(
                    () => toast.success('Receipt link copied'),
                    () => toast.error('Could not copy - the link is ' + data.link)
                  )
                }
              >
                Copy link
              </button>
              <button type="button" className="btn-secondary h-8 px-3 py-0 text-[13px]" onClick={() => setRecording(true)}>
                Record receipt
              </button>
            </div>
            <p className="text-[12px] text-slate-500">
              Client busy or offline? There’s no deadline - they can do it later, or send you a photo and signature any way they like and you record it
              here.
            </p>
            <InDeliveredMessageSwitch shipmentId={shipment._id} />
          </div>
        )}
      </div>

      {recording && (
        <Modal title="Record delivery receipt" description="From the photo and signature the client sent you." onClose={() => setRecording(false)}>
          <ReceiptForm
            bilingual={false}
            submitLabel="Save receipt"
            onSubmit={async (s) => {
              try {
                await apiClient.post(`/shipments/${shipment._id}/receipt`, toFormData(s), { timeout: 60_000 });
              } catch (err) {
                throw new Error(errorMessage(err, 'Could not save the receipt'));
              }
              toast.success('Receipt saved');
              setRecording(false);
              refresh();
            }}
          />
        </Modal>
      )}
    </section>
  );
}
