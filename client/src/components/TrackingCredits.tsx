import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { creditsApi, type TrackingCredits } from '../api/credits';
import { Modal } from './Modal';
import { Spinner } from './ui/Loading';

/** Kept fresh by the server's 'credits:updated' push (SocketContext); refetch is a fallback. */
export function useTrackingCredits() {
  return useQuery({ queryKey: ['tracking-credits'], queryFn: creditsApi.get, staleTime: 30_000, refetchInterval: 5 * 60_000 });
}

/** Green while plenty is left, amber under 40%, red under 10% or gone. */
function tone(c: Pick<TrackingCredits, 'left' | 'allowance'>) {
  if (c.left <= 0 || c.left <= c.allowance * 0.1) return 'red';
  if (c.left <= c.allowance * 0.4) return 'amber';
  return 'green';
}

const TONES = {
  green: { pill: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100', bar: 'bg-emerald-500', text: 'text-emerald-700' },
  amber: { pill: 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100', bar: 'bg-amber-500', text: 'text-amber-700' },
  red: { pill: 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100', bar: 'bg-red-500', text: 'text-red-700' },
};

const SOURCES: Record<string, string> = {
  'new-shipment': 'New shipment',
  refresh: 'Refresh (wasn’t registered)',
  background: 'Hourly check',
  'delivery-dates': 'Delivery-date finder',
};

/** The header's always-visible "credits left" - opens the details. */
export function CreditsPill() {
  const { data } = useTrackingCredits();
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const t = TONES[tone(data)];
  const pct = data.allowance ? Math.min(100, (data.used / data.allowance) * 100) : 100;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`TrackingMore credits: ${data.used} of ${data.allowance} used, ${data.left} left. Each new AWB uses 1.`}
        aria-label={`TrackingMore credits: ${data.left} of ${data.allowance} left`}
        className={clsx('relative flex h-8 items-center gap-1.5 overflow-hidden rounded-lg border px-2.5 text-[12px] font-semibold tabular-nums transition', t.pill)}
      >
        <CoinIcon />
        <span>
          {data.left}
          <span className="font-normal opacity-70">/{data.allowance}</span>
        </span>
        <span className="hidden font-medium lg:inline">credits left</span>
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black/5" aria-hidden>
          <span className={clsx('block h-full', t.bar)} style={{ width: `${pct}%` }} />
        </span>
      </button>
      {open && <CreditsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/** One line for forms that spend credits: "Uses 1 TrackingMore credit · 38 left". */
export function CreditCostNote({ count = 1 }: { count?: number }) {
  const { data } = useTrackingCredits();
  if (!data) return null;
  const t = TONES[tone(data)];
  if (data.left <= 0) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-800 ring-1 ring-red-200">
        No TrackingMore credits left - it will be saved but not tracked{data.renewsAt ? ` until they refill on ${format(new Date(data.renewsAt), 'd MMM')}` : ''}.
      </p>
    );
  }
  return (
    <p className="text-[12px] text-slate-500">
      Uses {count === 1 ? '1 TrackingMore credit' : `up to ${count} TrackingMore credits (1 per new AWB)`} ·{' '}
      <span className={clsx('font-semibold', t.text)}>{data.left} left</span> of {data.allowance}
      {count > data.left && <span className="font-semibold text-red-700"> - not enough for all of them</span>}
    </p>
  );
}

function CreditsDialog({ onClose }: { onClose: () => void }) {
  const { data } = useTrackingCredits();
  const [editing, setEditing] = useState(false);
  if (!data) return null;
  const t = TONES[tone(data)];
  const pct = data.allowance ? Math.min(100, (data.used / data.allowance) * 100) : 100;

  return (
    <Modal title="TrackingMore credits" description="Each new AWB registered for live tracking uses 1 credit." onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="flex items-baseline gap-2">
            <span className={clsx('text-[32px] font-semibold tabular-nums leading-none', t.text)}>{data.left}</span>
            <span className="text-[14px] text-slate-600">
              of {data.allowance} credits left · {data.used} used
            </span>
          </p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={data.used} aria-valuemin={0} aria-valuemax={data.allowance}>
            <div className={clsx('h-full rounded-full transition-all', t.bar)} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[12px] text-slate-500">
            Counting since {format(new Date(data.periodStart), 'd MMM yyyy')} ·{' '}
            {data.renewsAt ? `refills to ${data.allowance} on ${format(new Date(data.renewsAt), 'd MMM yyyy')}` : 'does not refill (free plan)'}
          </p>
          {data.left <= 0 && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-medium text-red-800 ring-1 ring-red-200">
              Credits are used up. New shipments are still saved, but they aren't tracked live until credits are added - the app won't go over the plan, so there's no extra bill.
            </p>
          )}
        </div>

        <div className="rounded-lg bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-700">
          <p className="font-semibold text-slate-900">Using credits carefully</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              <b>1 credit</b> for each new AWB - added by hand, by label scan, or by import.
            </li>
            <li>
              <b>Free:</b> the hourly status updates and the Refresh button on shipments that are already tracked.
            </li>
            <li>Check the AWB and courier before adding - a wrong number still uses a credit.</li>
            <li>Don't add test or duplicate AWBs. Hand deliveries (porter, self) can be marked delivered by hand.</li>
          </ul>
        </div>

        <div>
          <h3 className="text-[13px] font-semibold text-slate-900">Used recently</h3>
          {data.recent && data.recent.length > 0 ? (
            <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 text-[12px]">
              {data.recent.map((u) => (
                <li key={u._id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium tabular-nums text-slate-900">
                      {u.trackingNumber}
                      {u.carrierCode && <span className="font-normal text-slate-500"> · {u.carrierCode}</span>}
                    </span>
                    <span className="block truncate text-slate-500">
                      {SOURCES[u.source] || u.source}
                      {u.byName && ` · ${u.byName}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-slate-400" title={format(new Date(u.at), 'd MMM yyyy, h:mm a')}>
                    {formatDistanceToNow(new Date(u.at), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-slate-500">None used in this period yet.</p>
          )}
        </div>

        {editing ? (
          <PlanForm credits={data} onDone={() => setEditing(false)} />
        ) : (
          <button type="button" className="btn-secondary text-[13px]" onClick={() => setEditing(true)}>
            Change plan / correct the count
          </button>
        )}
        {data.updatedByName && <p className="text-[11px] text-slate-400">Plan last changed by {data.updatedByName}.</p>}
      </div>
    </Modal>
  );
}

const toDateInput = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

function PlanForm({ credits, onDone }: { credits: TrackingCredits; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [allowance, setAllowance] = useState(String(credits.allowance));
  const [start, setStart] = useState(toDateInput(credits.periodStart));
  const [monthly, setMonthly] = useState(credits.resetsMonthly);
  const [usedSoFar, setUsedSoFar] = useState('');
  const [autoRegister, setAutoRegister] = useState(credits.autoRegister);

  const save = useMutation({
    mutationFn: creditsApi.update,
    onSuccess: (next) => {
      queryClient.setQueryData(['tracking-credits'], next);
      toast.success('Credit plan saved');
      onDone();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Could not save'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const startChanged = start !== toDateInput(credits.periodStart);
    save.mutate({
      allowance: Number(allowance),
      // Midnight India time on the chosen day.
      ...(startChanged ? { periodStart: new Date(`${start}T00:00:00+05:30`).toISOString() } : {}),
      resetsMonthly: monthly,
      autoRegister,
      ...(usedSoFar.trim() !== '' ? { usedSoFar: Number(usedSoFar) } : {}),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[13px] font-medium text-slate-700">
          Credits in the plan
          <input type="number" min={0} required value={allowance} onChange={(e) => setAllowance(e.target.value)} className="input mt-1" />
        </label>
        <label className="block text-[13px] font-medium text-slate-700">
          Plan started on
          <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} className="input mt-1" />
        </label>
      </div>
      <p className="-mt-1 text-[12px] text-slate-500">Free plan: 50. Paid plan: 150 a month - set the start to the day it was bought.</p>
      <label className="flex items-start gap-2 text-[13px] text-slate-700">
        <input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} className="mt-0.5" />
        <span>
          <b>Refills every month</b> on the start date's day (paid plan). Leave off for the free plan.
        </span>
      </label>
      <label className="block text-[13px] font-medium text-slate-700">
        Used so far, as shown on TrackingMore <span className="font-normal text-slate-400">(optional)</span>
        <input type="number" min={0} value={usedSoFar} placeholder={String(credits.used)} onChange={(e) => setUsedSoFar(e.target.value)} className="input mt-1" />
        <span className="mt-1 block text-[12px] font-normal text-slate-500">
          Only if TrackingMore's dashboard shows a different number - the app then counts on from there.
        </span>
      </label>
      <label className="flex items-start gap-2 text-[13px] text-slate-700">
        <input type="checkbox" checked={autoRegister} onChange={(e) => setAutoRegister(e.target.checked)} className="mt-0.5" />
        <span>
          <b>Let the hourly check register untracked shipments.</b> Off (recommended): credits are only used when someone adds a
          shipment. On: active shipments TrackingMore doesn't know yet get registered automatically, 1 credit each.
        </span>
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary inline-flex items-center gap-2 text-[13px]" disabled={save.isPending} aria-busy={save.isPending}>
          {save.isPending && <Spinner />}
          Save
        </button>
        <button type="button" className="btn-secondary text-[13px]" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CoinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  );
}
