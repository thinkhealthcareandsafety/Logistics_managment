import { useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { FormField, Modal } from '../Modal';
import { useRotateStockLink, useUpdateStockSettings } from '../../hooks/useStock';
import { liveStockUrl } from '../../utils/stock';
import type { StockSettings } from '../../types/stock';

export function StockAutomationDialog({ settings, onClose }: { settings: StockSettings; onClose: () => void }) {
  const update = useUpdateStockSettings();
  const rotate = useRotateStockLink();

  const [enabled, setEnabled] = useState(settings.broadcast.enabled);
  const [time, setTime] = useState(settings.broadcast.time);
  const [recipients, setRecipients] = useState(settings.broadcast.recipients.join('\n'));
  const [hideZero, setHideZero] = useState(settings.hideZeroInMessage);

  const numbers = recipients
    .split(/[\n,]+/)
    .map((r) => r.trim())
    .filter(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await update.mutateAsync({
      hideZeroInMessage: hideZero,
      broadcast: { enabled, time, recipients: numbers },
    });
    onClose();
  }

  const link = liveStockUrl(settings.shareToken);

  return (
    <Modal
      size="lg"
      title="Automate stock updates"
      description="Stop typing the stock message - let it go out on its own, or give the group a link that’s always current."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
            Cancel
          </button>
          <button type="submit" form="stock-automation-form" disabled={update.isPending} className="btn-primary h-9 px-4 py-0 text-[13px]">
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="stock-automation-form" onSubmit={submit} className="space-y-6">
        {/* Daily send */}
        <section>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="daily-label" className="text-[14px] font-semibold text-slate-900">
                Daily WhatsApp update
              </h3>
              <p className="mt-0.5 text-[13px] text-slate-500">
                The current stock message goes to these numbers every day at the time you pick (India time).
              </p>
            </div>
            <Switch checked={enabled} onChange={setEnabled} labelledBy="daily-label" />
          </div>

          <div className={clsx('mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[140px_1fr]', !enabled && 'opacity-60')}>
            <FormField label="Send at" htmlFor="stock-time">
              <input
                id="stock-time"
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="input"
              />
            </FormField>
            <FormField
              label="WhatsApp numbers"
              htmlFor="stock-recipients"
              hint={`${numbers.length} number${numbers.length === 1 ? '' : 's'} - one per line, with country code.`}
            >
              <textarea
                id="stock-recipients"
                rows={3}
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder={'+91 98765 43210\n+91 91234 56780'}
                className="input resize-y font-mono text-[13px]"
              />
            </FormField>
          </div>

          {settings.broadcast.lastSentAt && (
            <p className="mt-2 text-[12px] text-slate-500">
              Last sent {format(new Date(settings.broadcast.lastSentAt), 'd MMM, h:mm a')}
            </p>
          )}
          {!settings.whatsappConfigured && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
              WhatsApp sending needs the Gupshup keys set on the server (GUPSHUP_API_KEY, GUPSHUP_SOURCE_NUMBER,
              GUPSHUP_APP_NAME). You can save the schedule now - it starts sending once they’re added.
            </p>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-slate-500">
            WhatsApp’s business API delivers to people, not into groups - so add each person who needs the update, or
            use the live link below for the group.
          </p>
        </section>

        {/* Live link */}
        <section className="border-t border-slate-100 pt-6">
          <h3 className="text-[14px] font-semibold text-slate-900">Live stock link for the group</h3>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Pin this in the WhatsApp group once. Anyone with it sees the latest numbers - no login, no one posting.
          </p>
          <div className="mt-3 flex gap-2">
            <input readOnly value={link} aria-label="Live stock link" className="input font-mono text-[12px] text-slate-600" onFocus={(e) => e.target.select()} />
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(link).then(
                  () => toast.success('Live stock link copied'),
                  () => toast.error('Could not copy the link')
                )
              }
              className="btn-secondary h-[38px] shrink-0 px-3 py-0 text-[13px]"
            >
              Copy
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirm('Replace the link? Anyone using the old one (including a pinned message) will lose access.')) {
                rotate.mutate();
              }
            }}
            disabled={rotate.isPending}
            className="mt-2 text-[12px] font-medium text-slate-500 underline-offset-2 hover:text-red-600 hover:underline"
          >
            Replace link (if it was shared with the wrong people)
          </button>
        </section>

        {/* Message format */}
        <section className="border-t border-slate-100 pt-6">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={hideZero}
              onChange={(e) => setHideZero(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-800"
            />
            <span>
              <span className="block text-[14px] font-medium text-slate-900">Leave out items with 0 in stock</span>
              <span className="block text-[13px] text-slate-500">Shorter message. Category totals stay the same.</span>
            </span>
          </label>
        </section>
      </form>
    </Modal>
  );
}

function Switch({ checked, onChange, labelledBy }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        checked ? 'bg-brand-800' : 'bg-slate-200'
      )}
    >
      <span
        className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')}
      />
    </button>
  );
}
