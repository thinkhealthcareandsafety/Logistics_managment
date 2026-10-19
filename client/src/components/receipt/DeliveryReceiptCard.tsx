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
