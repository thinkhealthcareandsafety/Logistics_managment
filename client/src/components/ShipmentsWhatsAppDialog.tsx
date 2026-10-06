import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from './Modal';
import { WhatsAppIcon, WhatsAppText } from './stock/ShareStockDialog';
import { buildShipmentsMessage } from '../utils/shipmentMessage';
import { whatsappShareUrl } from '../utils/stock';
import type { Shipment } from '../types/shipment';

/**
 * The shipments currently on screen as a ready-to-send WhatsApp message - so the ops
 * update for a group or a customer is one copy-paste, not typed out by hand.
 */
export function ShipmentsWhatsAppDialog({
  shipments,
  scope,
  onClose,
}: {
  shipments: Shipment[];
  /** Describes the active filters, e.g. "Bluedart · In transit". */
  scope?: string;
  onClose: () => void;
}) {
  const [includeLinks, setIncludeLinks] = useState(false);
  const text = useMemo(
    () => buildShipmentsMessage(shipments, { scope, includeLinks, origin: window.location.origin }),
    [shipments, scope, includeLinks]
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
      description={`The ${shipments.length} shipment${shipments.length === 1 ? '' : 's'} in your current view, grouped by status - issues first.`}
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
      <div className="rounded-xl bg-[#efeae2] p-3 ring-1 ring-inset ring-black/5">
        <div className="ml-auto max-w-full rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
          <pre className="max-h-[52vh] overflow-y-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.45] text-[#111b21]">
            <WhatsAppText text={text} />
          </pre>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-slate-500">
        Change the filters, courier or sort on the dashboard to change what’s included.
      </p>
    </Modal>
  );
}
