import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '../hooks/useNotifications';
import { ALL_STATUSES, STATUS_LABELS, STATUS_STYLES } from '../utils/status';
import type { ShipmentStatus } from '../types/shipment';

const STATUS_HINTS: Record<ShipmentStatus, string> = {
  pending: 'Booked, waiting for the courier to pick it up',
  in_transit: 'Every hub scan along the way - can be several a day',
  out_for_delivery: 'On the van for delivery today',
  delivered: 'Handed over to the customer',
  exception: 'Held, damaged, returned or a failed delivery attempt',
};

export function Settings() {
  const { data: prefs, isLoading } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [notifyOnStatuses, setNotifyOnStatuses] = useState<ShipmentStatus[]>([]);

  // Accounts created before a field existed come back without it; normalise once so
  // "missing" and "off" compare equal and the form doesn't open already dirty.
  const saved = useMemo(
    () =>
      prefs && {
        emailEnabled: !!prefs.emailEnabled,
        inAppEnabled: !!prefs.inAppEnabled,
        whatsappEnabled: !!prefs.whatsappEnabled,
        whatsappNumber: prefs.whatsappNumber || '',
        notifyOnStatuses: prefs.notifyOnStatuses || [],
      },
    [prefs]
  );

  function reset() {
    if (!saved) return;
    setEmailEnabled(saved.emailEnabled);
    setInAppEnabled(saved.inAppEnabled);
    setWhatsappEnabled(saved.whatsappEnabled);
    setWhatsappNumber(saved.whatsappNumber);
    setNotifyOnStatuses(saved.notifyOnStatuses);
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  // Only offer Save when something actually changed - a permanently enabled Save
  // button leaves people unsure whether their last change stuck.
  const dirty = useMemo(() => {
    if (!saved) return false;
    const sameStatuses =
      saved.notifyOnStatuses.length === notifyOnStatuses.length &&
      saved.notifyOnStatuses.every((s) => notifyOnStatuses.includes(s));
    return (
      saved.emailEnabled !== emailEnabled ||
      saved.inAppEnabled !== inAppEnabled ||
      saved.whatsappEnabled !== whatsappEnabled ||
      saved.whatsappNumber !== whatsappNumber ||
      !sameStatuses
    );
  }, [saved, emailEnabled, inAppEnabled, whatsappEnabled, whatsappNumber, notifyOnStatuses]);

  function toggleStatus(status: ShipmentStatus) {
    setNotifyOnStatuses((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
  }

  async function save() {
    if (whatsappEnabled && !whatsappNumber.trim()) {
      toast.error('Add a WhatsApp number to turn on WhatsApp alerts');
      return;
    }
    await updatePrefs.mutateAsync({ emailEnabled, inAppEnabled, whatsappEnabled, whatsappNumber, notifyOnStatuses });
    toast.success('Notification settings saved');
  }

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-7 w-56 animate-pulse rounded bg-slate-200" />
        <div className="h-48 animate-pulse rounded-xl bg-white ring-1 ring-slate-200" />
        <div className="h-72 animate-pulse rounded-xl bg-white ring-1 ring-slate-200" />
      </div>
    );
  }

  const noChannel = !emailEnabled && !inAppEnabled && !whatsappEnabled;

  return (
    <div className="space-y-8 pb-24">
      <div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-slate-950">Notification settings</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          How you hear about your shipments changing status. These settings are yours - teammates set their own.
        </p>
      </div>

      <SettingsSection
        title="Channels"
        description="Where alerts reach you. Turn on WhatsApp if you're often away from your desk."
      >
        <div className="divide-y divide-slate-100">
          <Toggle
            label="In-app"
            hint="The bell in the top bar."
            checked={inAppEnabled}
            onChange={setInAppEnabled}
          />
          <Toggle label="Email" hint="Sent to your work email." checked={emailEnabled} onChange={setEmailEnabled} />
          <Toggle
            label="WhatsApp"
            hint="Sent to the number below."
            checked={whatsappEnabled}
            onChange={setWhatsappEnabled}
          >
            {whatsappEnabled && (
              <div className="mt-3">
                <label htmlFor="whatsapp" className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  WhatsApp number
                </label>
                <input
                  id="whatsapp"
                  type="tel"
                  autoComplete="tel"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="input max-w-xs"
                />
                <p className="mt-1.5 text-xs text-slate-500">Include the country code.</p>
              </div>
            )}
          </Toggle>
        </div>
        {noChannel && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800 ring-1 ring-inset ring-amber-200">
            All channels are off - you won't hear about any status changes.
          </p>
        )}
      </SettingsSection>

      <SettingsSection
        title="Which updates"
        description="Most teams keep exceptions and deliveries on, and leave routine transit scans off to avoid noise."
      >
        <fieldset>
          <legend className="sr-only">Notify me when a shipment becomes</legend>
          <div className="divide-y divide-slate-100">
            {ALL_STATUSES.map((status) => {
              const checked = notifyOnStatuses.includes(status);
              return (
                <label key={status} className="flex cursor-pointer items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleStatus(status)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-800"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[14px] font-medium text-slate-900">
                      <span aria-hidden className={clsx('h-1.5 w-1.5 rounded-full', STATUS_STYLES[status].dot)} />
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-slate-500">{STATUS_HINTS[status]}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </SettingsSection>

      {/* Sticky save bar - appears only with unsaved changes. */}
      <div
        className={clsx(
          'fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur transition-transform duration-200',
          dirty ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        )}
        aria-hidden={!dirty}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="text-[13px] text-slate-600">You have unsaved changes.</p>
          <div className="flex gap-2">
            <button onClick={reset} className="btn-secondary h-9 px-3 py-0 text-[13px]" tabIndex={dirty ? 0 : -1}>
              Discard
            </button>
            <button
              onClick={save}
              disabled={updatePrefs.isPending}
              className="btn-primary h-9 px-4 py-0 text-[13px]"
              tabIndex={dirty ? 0 : -1}
            >
              {updatePrefs.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 lg:grid-cols-3 lg:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{description}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:col-span-2">
        {children}
      </div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  children,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  const id = `toggle-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p id={id} className="text-[14px] font-medium text-slate-900">
            {label}
          </p>
          <p className="text-[13px] text-slate-500">{hint}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={id}
          onClick={() => onChange(!checked)}
          className={clsx(
            'relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
            checked ? 'bg-brand-800' : 'bg-slate-200'
          )}
        >
          <span
            className={clsx(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
              checked ? 'left-[22px]' : 'left-0.5'
            )}
          />
        </button>
      </div>
      {children}
    </div>
  );
}
