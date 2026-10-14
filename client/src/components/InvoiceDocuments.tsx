import { useState } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../api/client';
import type { Shipment } from '../types/shipment';
import { Spinner } from './ui/Loading';

/** The government's public e-way bill print page (number + captcha, no login). */
const EWAY_PRINT_URL = 'https://ewaybillgst.gov.in/Others/EBPrintnew.aspx';

/** "2026-01-282, 2026-01-315" -> both numbers (same split as the server). */
export const invoiceNumbers = (s: Shipment) =>
  [
    ...new Set(
      [s.zohoInvoice?.number, s.booking?.invoiceNumber]
        .flatMap((t) => String(t || '').split(/[,&/\\]+|\s+and\s+/i))
        .map((n) => n.trim())
        .filter((n) => n.length >= 3)
    ),
  ];

/** An error from a blob request carries its JSON message as a Blob - read it out. */
async function messageOf(err: unknown, fallback: string) {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()).message || fallback;
    } catch {
      return fallback;
    }
  }
  return (data as { message?: string })?.message || fallback;
}

async function fetchPdf(shipmentId: string, number: string) {
  const res = await apiClient.get<Blob>(`/shipments/${shipmentId}/invoice.pdf`, { params: { number }, responseType: 'blob' });
  return URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
}

/** Opens a tab now (so pop-up blockers allow it), then points it at `load()`'s URL. */
async function openInNewTab(load: () => Promise<string>, failMessage: string) {
  const tab = window.open('', '_blank');
  try {
    const url = await load();
    if (tab) {
      tab.opener = null; // the opened page gets no handle back to the app
      tab.location.href = url;
    }
    else window.location.assign(url);
  } catch (err) {
    tab?.close();
    toast.error(await messageOf(err, failMessage));
  }
}

/**
 * The shipment's Zoho Books invoice(s) - view or download the PDF Zoho prints - and its
 * e-way bill: Zoho Books' API has no e-way bill download, so "Print" copies the number
 * and opens the government portal's print page, and "Open in Zoho Books" goes to the
 * invoice, where Zoho's own "Print e-Way Bill" is.
 */
export function InvoiceDocuments({ shipment, part }: { shipment: Shipment; part: 'invoices' | 'ewayBill' }) {
  const numbers = invoiceNumbers(shipment);
  const [busy, setBusy] = useState('');
  if (part === 'invoices' ? !numbers.length : !shipment.ewayBill?.number) return null;

  async function download(number: string) {
    setBusy(`dl:${number}`);
    try {
      const url = await fetchPdf(shipment._id, number);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${number.replace(/[^\w.-]+/g, '_')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(await messageOf(err, 'Could not download the invoice'));
    } finally {
      setBusy('');
    }
  }

  async function view(number: string) {
    setBusy(`view:${number}`);
    await openInNewTab(() => fetchPdf(shipment._id, number), 'Could not open the invoice');
    setBusy('');
  }

  async function openInZoho(number: string) {
    setBusy(`zoho:${number}`);
    await openInNewTab(
      () =>
        apiClient
          .get<{ url: string }>(`/shipments/${shipment._id}/invoice-link`, { params: { number } })
          .then((r) => r.data.url),
      'Could not find the invoice in Zoho Books'
    );
    setBusy('');
  }

  async function printEwayBill() {
    const ewb = shipment.ewayBill?.number || '';
    try {
      await navigator.clipboard.writeText(ewb);
      toast.success('E-way bill number copied - paste it on the portal, fill the captcha, then Print');
    } catch {
      toast(`Enter e-way bill number ${ewb} on the portal`);
    }
    window.open(EWAY_PRINT_URL, '_blank', 'noopener,noreferrer');
  }

  const button =
    'inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60';

  return (
    <div className="space-y-2">
      {part === 'invoices' && numbers.map((number) => (
        <div key={number} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <p className="mr-auto text-[12px] text-slate-500">
            Invoice <span className="font-medium text-slate-800">{number}</span>
            {shipment.zohoInvoice?.matchedBy === 'customer+date' && ' (matched by customer and date)'}
          </p>
          <button type="button" className={button} disabled={!!busy} onClick={() => view(number)}>
            {busy === `view:${number}` && <Spinner />}View
          </button>
          <button type="button" className={button} disabled={!!busy} onClick={() => download(number)}>
            {busy === `dl:${number}` && <Spinner />}Download
          </button>
        </div>
      ))}
      {part === 'ewayBill' && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" className={button} onClick={printEwayBill} title="Copies the number and opens the government e-way bill print page">
            Print / download e-way bill
          </button>
          {numbers[0] && (
            <button type="button" className={button} disabled={!!busy} onClick={() => openInZoho(numbers[0])}>
              {busy === `zoho:${numbers[0]}` && <Spinner />}Open in Zoho Books
            </button>
          )}
        </div>
      )}
    </div>
  );
}
