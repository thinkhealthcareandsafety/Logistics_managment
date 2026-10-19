import clsx from 'clsx';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from './Modal';
import { WhatsAppIcon, WhatsAppText } from './stock/ShareStockDialog';
import { SegmentedControl } from './SegmentedControl';
import { buildShipmentsMessage } from '../utils/shipmentMessage';
import { deliveredOn } from '../utils/logistics';
import { whatsappShareUrl } from '../utils/stock';
import type { Shipment } from '../types/shipment';

/**
 * Which shipments go in the message:
 * - current: everything not delivered yet, plus what was delivered today - so a finished
 *   order appears once, on the day it's delivered, and not in every update after that;
 * - range: everything shipped between two dates (delivered or not);
 * - all: the whole view, as before.
 */
type Include = 'current' | 'range' | 'all';

const RANGE_KEY = 'th.shipmentsMessage';
/** "YYYY-MM-DD" in India time. */
const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
const shortDay = (day: string) => day.split('-').reverse().slice(0, 2).join('/');

function readSaved(): { include: Include; from: string; to: string } {
  const fallback = { include: 'current' as Include, from: istDay(new Date(Date.now() - 7 * 86_400_000)), to: '' };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(RANGE_KEY) || '{}') };
  } catch {
    return fallback;
  }
}

/**
 * The shipments currently on screen as a ready-to-send WhatsApp message - so the ops
 * update for a group or a customer is one copy-paste, not typed out by hand.
 */
export function ShipmentsWhatsAppDialog({
  shipments,
  scope,
  fixed = false,
  onClose,
}: {
  shipments: Shipment[];
  /** Describes the active filters, e.g. "Bluedart · In transit". */
  scope?: string;
  /** Exactly these shipments (e.g. one board column / month) - no include choices shown. */
  fixed?: boolean;
  onClose: () => void;
}) {
  const [includeLinks, setIncludeLinks] = useState(true);
  const [{ include, from, to }, setChoice] = useState(readSaved);
  function choose(next: Partial<{ include: Include; from: string; to: string }>) {
    setChoice((prev) => {
      const value = { ...prev, ...next };
      try {
        localStorage.setItem(RANGE_KEY, JSON.stringify(value));
      } catch {
        // not remembered - fine
      }
      return value;
    });
  }

  const today = istDay(new Date());
  const current = useMemo(
    () => shipments.filter((s) => s.status !== 'delivered' || istDay(deliveredOn(s) ?? new Date(0)) === today),
    [shipments, today]
  );
  const inRange = useMemo(
    () =>
      shipments.filter((s) => {
        const shipped = istDay(new Date(s.shippingDate || s.createdAt));
        return (!from || shipped >= from) && (!to || shipped <= to);
      }),
    [shipments, from, to]
  );
  const included = fixed ? shipments : include === 'current' ? current : include === 'range' ? inRange : shipments;
  const rangeLabel = fixed
    ? ''
    : include === 'current'
      ? 'Current shipments + delivered today'
      : include === 'range'
        ? `Shipped ${from ? `from ${shortDay(from)}` : ''}${to ? ` to ${shortDay(to)}` : from ? ' onwards' : 'any date'}`
        : '';
  const text = useMemo(
    () =>
      buildShipmentsMessage(included, {
        scope: [scope, rangeLabel].filter(Boolean).join(' · ') || undefined,
        includeLinks,
        origin: window.location.origin,
      }),
    [included, scope, rangeLabel, includeLinks]
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Message copied - paste it into WhatsApp');
    } catch {
      toast.error('Could not copy - select the text and copy it manually');
    }
  }

  return (
    <Modal
      size="lg"
      title="WhatsApp message"
      description={
        fixed
          ? `${included.length} shipment${included.length === 1 ? '' : 's'}${scope ? ` - ${scope}` : ''}, ready to copy or open in WhatsApp.`
          : `${included.length} of the ${shipments.length} shipment${shipments.length === 1 ? '' : 's'} in your current view, grouped by status - issues first.`
      }
      onClose={onClose}
      footer={
        <>
          <label className="mr-auto flex cursor-pointer items-center gap-2 text-[13px] text-slate-700">
            <input
              type="checkbox"
              checked={includeLinks}
              onChange={(e) => setIncludeLinks(e.target.checked)}
              className="h-4 w-4 accent-brand-800"
            />
            Include tracking links
          </label>
          <button type="button" onClick={copy} className="btn-secondary inline-flex h-9 items-center gap-2 px-3 py-0 text-[13px]">
            Copy message
          </button>
          <a
            href={whatsappShareUrl(text)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1f9d55] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#188046]"
          >
            <WhatsAppIcon />
            Open in WhatsApp
          </a>
        </>
      }
    >
      <div className={clsx('mb-3 flex flex-wrap items-center gap-2', fixed && 'hidden')}>
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            label="Shipments to include"
            value={include}
            onChange={(value) => choose({ include: value })}
            segments={[
              { value: 'current', label: 'Current + delivered today', count: current.length },
              { value: 'range', label: 'Shipped between dates', count: inRange.length },
              { value: 'all', label: 'All in view', count: shipments.length },
            ]}
          />
        </div>
        {include === 'range' && (
          <div className="flex items-center gap-1.5 text-[13px] text-slate-600">
            <label htmlFor="msg-from" className="sr-only">
              Shipped from
            </label>
            <input id="msg-from" type="date" value={from} max={to || undefined} onChange={(e) => choose({ from: e.target.value })} className="input h-8 w-auto py-0" />
            <span>to</span>
            <label htmlFor="msg-to" className="sr-only">
              Shipped until
            </label>
            <input id="msg-to" type="date" value={to} min={from || undefined} onChange={(e) => choose({ to: e.target.value })} className="input h-8 w-auto py-0" />
            {to && (
              <button type="button" onClick={() => choose({ to: '' })} className="text-[12px] font-medium text-brand-700 hover:text-brand-900">
                Until today
              </button>
            )}
          </div>
        )}
      </div>
      <div className="rounded-xl bg-[#efeae2] p-3 ring-1 ring-inset ring-black/5">
        <div className="ml-auto max-w-full rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
          <pre className="max-h-[52vh] overflow-y-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.45] text-[#111b21]">
            <WhatsAppText text={text} />
          </pre>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-slate-500">
        {fixed ? 'Opens your own WhatsApp - nothing is sent automatically.' : 'Change the filters, courier or sort on the dashboard to change what’s included.'}
      </p>
    </Modal>
  );
}
