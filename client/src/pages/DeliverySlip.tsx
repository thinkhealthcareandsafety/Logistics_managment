import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { apiClient } from '../api/client';
import { useShipment } from '../hooks/useShipments';
import { Spinner } from '../components/ui/Loading';

/**
 * The slip that goes in the box with the invoice. Whoever takes the parcel in - client,
 * watchman, reception - scans the QR with their phone camera and confirms with their
 * name, a photo and a signature. The QR is made here in the browser; nothing external.
 */
export function DeliverySlip() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: s } = useShipment(id);
  const { data: link } = useQuery({
    queryKey: ['receipt', id, 'link'],
    queryFn: () => apiClient.get<{ link: string }>(`/shipments/${id}/receipt`).then((r) => r.data.link),
  });
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (link) QRCode.toDataURL(link, { margin: 1, width: 480, errorCorrectionLevel: 'M' }).then(setQr, () => setQr(''));
  }, [link]);

  if (!s || !link || !qr) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const place = [s.deliveryAddress?.city, s.deliveryAddress?.state].filter(Boolean).join(', ');
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-[680px] px-6 py-8 print:max-w-none print:p-0">
        <div className="mb-6 flex justify-end gap-2 print:hidden">
          <button type="button" onClick={() => window.print()} className="btn-primary">
            Print slip
          </button>
        </div>

        <article className="rounded-2xl border-2 border-slate-900 p-6">
          <header className="flex items-center justify-between gap-4 border-b border-slate-300 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-[14px] font-bold text-white">TH</span>
              <div>
                <p className="text-[16px] font-bold">ThinkHealth</p>
                <p className="text-[12px] text-slate-600">Delivery receipt · डिलीवरी रसीद</p>
              </div>
            </div>
            <p className="text-right text-[12px] text-slate-600">
              AWB <span className="font-mono text-[14px] font-semibold text-slate-900">{s.trackingNumber}</span>
              <br />
              {s.carrierName}
            </p>
          </header>

          <div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-6">
            <div>
              <h1 className="text-[22px] font-bold leading-tight">Received this parcel? Please scan.</h1>
              <p className="mt-1 text-[16px] font-medium">पार्सल मिलने पर यह QR स्कैन करें।</p>
              <ol className="mt-4 space-y-1.5 text-[14px] leading-snug">
                <li>1. Scan the QR with your phone camera · फ़ोन कैमरा से स्कैन करें</li>
                <li>2. Write your name and who you are · अपना नाम और आप कौन हैं</li>
                <li>3. Take a photo of the parcel · पार्सल की फ़ोटो लें</li>
                <li>4. Sign with your finger and confirm · हस्ताक्षर करके पुष्टि करें</li>
              </ol>
              <p className="mt-3 text-[12px] text-slate-600">
                Anyone receiving it can do this - security, reception or a colleague. No internet right now? Fill it in anyway; it is sent when the
                phone is back online.
              </p>
            </div>
            <img src={qr} alt="QR code for the delivery receipt" className="h-48 w-48" />
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-slate-300 pt-4 text-[13px]">
            <div>
              <dt className="text-slate-500">For</dt>
              <dd className="font-semibold">{s.customerInfo?.name || '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Deliver to</dt>
              <dd className="font-semibold">{place || '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Contents</dt>
              <dd className="font-semibold">
                {s.productDetails?.name || '-'}
                {s.productDetails?.quantity ? ` · ${s.productDetails.quantity} unit${s.productDetails.quantity === 1 ? '' : 's'}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Shipped</dt>
              <dd className="font-semibold">{s.shippingDate ? format(new Date(s.shippingDate), 'd MMM yyyy') : '-'}</dd>
            </div>
          </dl>
          <p className="mt-4 break-all text-center font-mono text-[11px] text-slate-500">{link}</p>
        </article>
      </div>
    </div>
  );
}
