import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { apiClient } from '../api/client';
import { useShipment } from '../hooks/useShipments';

/**
 * The QR sticker for the box: stuck on at dispatch, scanned by whoever receives it
 * (client, watchman, reception) to confirm with a photo and signature. Just the QR and
 * the AWB in small type, so each sticker goes on the right box. Made in the browser.
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
    if (link) QRCode.toDataURL(link, { margin: 1, width: 600, errorCorrectionLevel: 'M' }).then(setQr, () => setQr(''));
  }, [link]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white p-6 print:block print:min-h-0 print:p-0">
      <button type="button" onClick={() => window.print()} disabled={!qr} className="btn-primary print:hidden">
        Print QR sticker
      </button>

      <figure className="flex w-[6cm] flex-col items-center rounded-lg border border-dashed border-slate-300 p-[3mm] print:border-0">
        {qr ? (
          <img src={qr} alt="Delivery receipt QR code" className="h-[5.4cm] w-[5.4cm]" />
        ) : (
          <div className="shimmer h-[5.4cm] w-[5.4cm] rounded" aria-label="Making the QR code" />
        )}
        <figcaption className="mt-1 text-center font-mono text-[9px] leading-tight text-slate-700">{s?.trackingNumber || ' '}</figcaption>
      </figure>

      <p className="max-w-xs text-center text-[12px] text-slate-500 print:hidden">
        Stick it on the box. Whoever receives it scans it with their phone camera and confirms with a photo and signature.
      </p>
    </div>
  );
}
