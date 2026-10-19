import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '../api/client';
import { Modal } from './Modal';
import { Spinner } from './ui/Loading';
import { WhatsAppText } from './stock/ShareStockDialog';

interface BroadcastSettings {
  enabled: boolean;
  time: string;
  recipients: string[];
  includeLinks: boolean;
  lastSentAt: string | null;
  whatsappConfigured: boolean;
}

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/**
 * The daily shipment update on WhatsApp - current shipments + delivered today, sent by
 * itself at a set time. Ready to use but OFF: it can only be switched on once the
 * WhatsApp API key is on the server (and WhatsApp isn't paused).
 */
export function ShipmentAutomationDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['shipment-broadcast'],
    queryFn: () => apiClient.get<{ settings: BroadcastSettings; preview: string }>('/shipment-broadcast').then((r) => r.data),
  });
  const [time, setTime] = useState('18:00');
  const [numbers, setNumbers] = useState('');
  const [includeLinks, setIncludeLinks] = useState(true);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!data) return;
    setTime(data.settings.time);
    setNumbers(data.settings.recipients.join('\n'));
    setIncludeLinks(data.settings.includeLinks);
    setEnabled(data.settings.enabled);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiClient.patch('/shipment-broadcast', {
        time,
        includeLinks,
        enabled,
        recipients: numbers.split(/[\n,]+/).map((n) => n.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      toast.success(enabled ? 'Daily update switched on' : 'Saved - the daily update stays off');
      queryClient.invalidateQueries({ queryKey: ['shipment-broadcast'] });
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save')),
  });

  const sendNow = useMutation({
    mutationFn: () => apiClient.post<{ sent: number; total: number }>('/shipment-broadcast/send').then((r) => r.data),
    onSuccess: (r) => toast.success(`Sent to ${r.sent} of ${r.total}`),
    onError: (err) => toast.error(errorMessage(err, 'Could not send')),
  });

  const configured = Boolean(data?.settings.whatsappConfigured);

  return (
    <Modal
      size="lg"
      title="Daily shipment update on WhatsApp"
      description="Current shipments + those delivered today, sent by itself every day at the time you choose."
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={() => sendNow.mutate()}
            disabled={!configured || sendNow.isPending || !data?.settings.recipients.length}
            title={configured ? 'Send today’s update to the saved numbers now' : 'Needs the WhatsApp API key on the server'}
            className="btn-secondary mr-auto inline-flex h-9 items-center gap-2 px-3 py-0 text-[13px]"
          >
            {sendNow.isPending && <Spinner />}
            Send now
          </button>
          <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
            Cancel
          </button>
          <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !data} className="btn-primary inline-flex h-9 items-center gap-2 px-4 py-0 text-[13px]">
            {save.isPending && <Spinner />}
            Save
          </button>
        </>
      }
    >
      {!data ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-10 animate-pulse rounded bg-slate-100" />
          <div className="h-24 animate-pulse rounded bg-slate-100" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-4 text-[13px]">
            {!configured && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                WhatsApp isn’t connected yet - add the WhatsApp (Anantya) API key on the server, then switch this on. Until then it never sends, so it
                can’t cost anything.
              </p>
            )}
            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
              <span>
                <span className="block font-medium text-slate-900">Send automatically</span>
                <span className="block text-[12px] text-slate-500">{enabled ? `Every day at ${time}` : 'Off'}</span>
              </span>
              <input
                type="checkbox"
                checked={enabled}
                disabled={!configured && !enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-5 w-5 accent-brand-800"
                aria-label="Send the daily update automatically"
              />
            </label>
            <div>
              <label htmlFor="sb-time" className="mb-1 block font-medium text-slate-800">
                Time (India)
              </label>
              <input id="sb-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input w-40" />
            </div>
            <div>
              <label htmlFor="sb-numbers" className="mb-1 block font-medium text-slate-800">
                WhatsApp numbers
              </label>
              <textarea
                id="sb-numbers"
                rows={4}
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
                placeholder={'One per line, with country code\n+91 98765 43210'}
                className="input"
              />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={includeLinks} onChange={(e) => setIncludeLinks(e.target.checked)} className="h-4 w-4 accent-brand-800" />
              Include tracking links
            </label>
          </div>
          <div>
            <p className="mb-1 text-[12px] font-medium text-slate-500">Today’s message</p>
            <div className="rounded-xl bg-[#efeae2] p-3 ring-1 ring-inset ring-black/5">
              <div className="rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-2">
                <pre className="max-h-[46vh] overflow-y-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-[1.45] text-[#111b21]">
                  <WhatsAppText text={data.preview} />
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
