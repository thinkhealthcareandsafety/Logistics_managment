import { useState, type ReactNode } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { Modal } from '../Modal';
import {
  useConnectZoho,
  useDisconnectZoho,
  useRotateZohoWebhook,
  useSyncZoho,
  useUpdateZoho,
  useZohoStatus,
} from '../../hooks/useStock';
import type { ZohoStatus } from '../../types/stock';

/** "*\/15 * * * *" -> "every 15 minutes"; anything fancier is shown as written. */
export function describeSchedule(cron: string) {
  const m = cron.trim().match(/^\*\/(\d+) \* \* \* \*$/);
  if (m) return `every ${m[1]} minutes`;
  if (cron.trim() === '* * * * *') return 'every minute';
  if (/^0 \* \* \* \*$/.test(cron.trim())) return 'every hour';
  return `on the schedule “${cron}”`;
}

export function summaryText(s: ZohoStatus['lastSyncSummary']) {
  const parts = [
    s.stockIn && `${s.stockIn} in`,
    s.stockOut && `${s.stockOut} out`,
    s.created && `${s.created} new`,
    s.linked && `${s.linked} linked`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'no changes';
}

/**
 * Zoho Books -> stock. Connect once; from then on bills add stock, invoices remove it
 * and new products appear by themselves. Linked lines stop being edited by hand here.
 */
export function ZohoBooksDialog({ onClose }: { onClose: () => void }) {
  const { data: zoho, isLoading } = useZohoStatus();
  const connect = useConnectZoho();
  const disconnect = useDisconnectZoho();

  const footer = (
    <>
      {zoho?.connected && (
        <button
          type="button"
          disabled={disconnect.isPending}
          onClick={() => {
            if (confirm('Disconnect Zoho Books? Stock stops following Zoho and every line can be counted by hand again.')) {
              disconnect.mutate();
            }
          }}
          className="mr-auto h-9 rounded-lg px-3 text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
        >
          Disconnect
        </button>
      )}
      <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
        {zoho?.connected ? 'Done' : 'Cancel'}
      </button>
      {zoho && !zoho.connected && !zoho.needsOrganization && (
        <button
          type="button"
          disabled={!zoho.configured || connect.isPending}
          title={!zoho.configured ? 'Add the Zoho keys on the server first' : undefined}
          onClick={() => connect.mutate()}
          className="btn-primary h-9 px-4 py-0 text-[13px]"
        >
          {connect.isPending ? 'Opening Zoho…' : 'Connect Zoho Books'}
        </button>
      )}
    </>
  );

  return (
    <Modal
      size="lg"
      title="Zoho Books"
      description="Stock in and out follows your books - purchases add stock, sales take it off."
      onClose={onClose}
      footer={footer}
    >
      {isLoading || !zoho ? (
        <div className="h-48 animate-pulse rounded-lg bg-slate-50" />
      ) : zoho.connected ? (
        <Connected zoho={zoho} />
      ) : zoho.needsOrganization ? (
        <PickOrganization zoho={zoho} />
      ) : (
        <NotConnected zoho={zoho} />
      )}
    </Modal>
  );
}

function NotConnected({ zoho }: { zoho: ZohoStatus }) {
  return (
    <div className="space-y-5 text-[13px]">
      <ul className="space-y-2.5">
        <Point title="Purchases add stock">A bill saved in Zoho Books adds its quantities here as new stock.</Point>
        <Point title="Sales take it off">An invoice removes stock - old stock first - and shows under “Stock Out” in the WhatsApp update.</Point>
        <Point title="New products appear by themselves">
          A product bought for the first time gets its own line in “{zoho.autoCategory}”.
        </Point>
        <Point title="Your lines are matched for you">
          By SKU (= the line’s product code here), otherwise by the same name. Lines that aren’t in Zoho stay manual.
        </Point>
      </ul>
      <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-200">
        Read-only access: this app reads items and stock from Zoho Books and never changes your books.
      </p>

      {!zoho.configured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
          <p className="font-semibold text-amber-900">One-time setup on the server</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[12px] leading-relaxed text-amber-900">
            <li>
              Open the Zoho API Console for your region (India: <span className="font-mono">api-console.zoho.in</span>) and
              add a <strong>Server-based Application</strong>.
            </li>
            <li>
              Set its Authorized Redirect URI to:
              <CopyField value={zoho.redirectUri} />
            </li>
            <li>
              Put the Client ID and Client Secret in the server’s <span className="font-mono">.env</span> as{' '}
              <span className="font-mono">ZOHO_CLIENT_ID</span> and <span className="font-mono">ZOHO_CLIENT_SECRET</span>
              {zoho.dataCenter !== 'in' ? '' : ' (outside India also set ZOHO_DC, e.g. com or eu)'}, then restart the server.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}

function PickOrganization({ zoho }: { zoho: ZohoStatus }) {
  const update = useUpdateZoho();
  const [org, setOrg] = useState(zoho.organizations[0]?.id ?? '');
  if (zoho.organizations.length === 0) {
    return (
      <p className="text-[13px] text-slate-600">
        Your Zoho account has no Zoho Books organisation. Create one in Zoho Books, then disconnect and connect again.
      </p>
    );
  }
  return (
    <div className="space-y-3 text-[13px]">
      <p className="text-slate-700">Your Zoho login has more than one organisation. Which one holds this stock?</p>
      <div className="space-y-2">
        {zoho.organizations.map((o) => (
          <label
            key={o.id}
            className={clsx(
              'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-inset transition',
              org === o.id ? 'bg-brand-50 ring-brand-300' : 'ring-slate-200 hover:bg-slate-50'
            )}
          >
            <input type="radio" name="zoho-org" checked={org === o.id} onChange={() => setOrg(o.id)} className="accent-brand-800" />
            <span className="font-medium text-slate-900">{o.name}</span>
            <span className="ml-auto font-mono text-[11px] text-slate-400">{o.id}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={!org || update.isPending}
        onClick={() => update.mutate({ organizationId: org })}
        className="btn-primary h-9 px-4 py-0 text-[13px]"
      >
        Use this organisation
      </button>
    </div>
  );
}

function Connected({ zoho }: { zoho: ZohoStatus }) {
  const sync = useSyncZoho();
  const update = useUpdateZoho();
  const rotate = useRotateZohoWebhook();
  const failing = zoho.lastSyncOk === false;
  const local = /localhost|127\.0\.0\.1/.test(zoho.webhookUrl ?? '');

  return (
    <div className="space-y-6 text-[13px]">
      {/* Status */}
      <div className={clsx('rounded-lg border p-4', failing ? 'border-red-200 bg-red-50/60' : 'border-slate-200 bg-slate-50/60')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <span aria-hidden className={clsx('h-2 w-2 rounded-full', failing ? 'bg-red-500' : 'bg-emerald-500')} />
              {zoho.organizationName || 'Zoho Books'}
            </p>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Connected{zoho.connectedBy && ` by ${zoho.connectedBy}`}
              {zoho.connectedAt && ` on ${format(new Date(zoho.connectedAt), 'd MMM yyyy')}`} · syncs{' '}
              {describeSchedule(zoho.syncSchedule)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="btn-secondary h-8 shrink-0 px-3 py-0 text-[13px]"
          >
            {sync.isPending ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-200/70 pt-3">
          <Stat label="Lines following Zoho" value={zoho.linkedItems} />
          <Stat label="Stocked items in Zoho" value={zoho.lastSyncSummary.zohoItems} />
          <div>
            <dt className="text-[11px] text-slate-500">Last sync</dt>
            <dd className={clsx('mt-0.5 font-medium', failing ? 'text-red-700' : 'text-slate-900')}>
              {zoho.lastSyncAt ? formatDistanceToNow(new Date(zoho.lastSyncAt), { addSuffix: true }) : 'Not yet'}
            </dd>
            {zoho.lastSyncAt && !failing && <dd className="text-[11px] text-slate-500">{summaryText(zoho.lastSyncSummary)}</dd>}
          </div>
        </dl>
        {failing && <p className="mt-3 text-[12px] leading-snug text-red-700">{zoho.lastSyncError}</p>}
        {!failing && !!zoho.lastSyncSummary.held && (
          <p className="mt-3 rounded-md bg-amber-50 px-2.5 py-2 text-[12px] leading-snug text-amber-900 ring-1 ring-inset ring-amber-200">
            {zoho.lastSyncSummary.held} line{zoho.lastSyncSummary.held === 1 ? '' : 's'} not linked because Zoho shows 0 in
            stock but you have stock here - update the quantity in Zoho Books and they link on the next sync
            {zoho.lastSyncSummary.heldNames?.length ? `: ${zoho.lastSyncSummary.heldNames.join(', ')}` : ''}.
          </p>
        )}
        {!failing && !!zoho.lastSyncSummary.noFigure && (
          <p className="mt-2 text-[12px] leading-snug text-slate-500">
            {zoho.lastSyncSummary.noFigure} Zoho item{zoho.lastSyncSummary.noFigure === 1 ? '' : 's'} came without a stock
            quantity and {zoho.lastSyncSummary.noFigure === 1 ? 'was' : 'were'} skipped.
          </p>
        )}
      </div>

      {/* Options */}
      <div className="space-y-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={zoho.autoCreate}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ autoCreate: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-brand-800"
          />
          <span>
            <span className="font-medium text-slate-900">Add new Zoho products automatically</span>
            <span className="block text-[12px] text-slate-500">
              A product with stock in Zoho and no matching line here gets a line in “{zoho.autoCategory}”. Move it to the
              right category whenever you like.
            </span>
          </span>
        </label>
        {zoho.organizations.length > 1 && (
          <label className="block">
            <span className="mb-1.5 block font-medium text-slate-700">Organisation</span>
            <select
              value={zoho.organizationId}
              disabled={update.isPending}
              onChange={(e) => {
                if (confirm('Switch organisation? Lines are re-matched against the new organisation’s items.')) {
                  update.mutate({ organizationId: e.target.value });
                }
              }}
              className="input"
            >
              {zoho.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Instant updates */}
      <div className="border-t border-slate-100 pt-5">
        <p className="font-semibold text-slate-900">Instant updates (optional)</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
          Stock already catches up {describeSchedule(zoho.syncSchedule)}. To update the moment a bill or invoice is saved
          - and label each change with its bill or invoice number - add a workflow rule in Zoho Books:
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[12px] leading-relaxed text-slate-700">
          <li>Settings → Automation → Workflow Rules → New Rule.</li>
          <li>
            Module <strong>Bills</strong>, run when a bill is <strong>created or edited</strong>. Make one rule each for{' '}
            <strong>Invoices</strong>, <strong>Credit Notes</strong>, <strong>Vendor Credits</strong> and{' '}
            <strong>Inventory Adjustments</strong>.
          </li>
          <li>
            Action: <strong>Webhook</strong>, method POST, send the default entity payload, to this URL:
            {zoho.webhookUrl && <CopyField value={zoho.webhookUrl} secret />}
          </li>
        </ol>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <span className="text-slate-500">
            {zoho.lastWebhookAt
              ? `Last call from Zoho ${formatDistanceToNow(new Date(zoho.lastWebhookAt), { addSuffix: true })}`
              : 'No calls from Zoho yet'}
          </span>
          <button
            type="button"
            disabled={rotate.isPending}
            onClick={() => {
              if (confirm('Create a new webhook URL? The old one stops working until you update your Zoho rules.')) rotate.mutate();
            }}
            className="rounded font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            Replace URL
          </button>
        </div>
        {local && (
          <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[12px] leading-snug text-amber-800 ring-1 ring-inset ring-amber-200">
            Zoho can’t reach a localhost address. This starts working once the app is deployed and SERVER_URL is set to its
            public address - until then the scheduled sync keeps stock current.
          </p>
        )}
      </div>
    </div>
  );
}

function Point({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <svg className="mt-[3px] h-3.5 w-3.5 shrink-0 text-brand-700" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
      </svg>
      <span>
        <span className="font-medium text-slate-900">{title}.</span> <span className="text-slate-600">{children}</span>
      </span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-[18px] font-semibold leading-tight tabular-nums text-slate-950">{value.toLocaleString('en-IN')}</dd>
    </div>
  );
}

function CopyField({ value, secret = false }: { value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="mt-1.5 flex items-center gap-2">
      <input
        readOnly
        value={value}
        onClick={(e) => e.currentTarget.select()}
        aria-label={secret ? 'Webhook URL (keep private)' : 'Redirect URI'}
        className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 font-mono text-[11px] text-slate-700 outline-none focus:border-brand-500"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard blocked - the field is selectable instead.
          }
        }}
        className="btn-secondary h-8 shrink-0 px-2.5 py-0 text-[12px]"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}
