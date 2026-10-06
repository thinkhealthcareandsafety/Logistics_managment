import { Fragment } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../Modal';
import { useSendStockNow, useStockMessage } from '../../hooks/useStock';
import { liveStockUrl, whatsappShareUrl } from '../../utils/stock';
import type { StockSettings } from '../../types/stock';
import { Skeleton, SkeletonRegion, Spinner } from '../ui/Loading';

/** Renders WhatsApp's *bold* markup the way the group will see it. */
export function WhatsAppText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <Fragment key={i}>
          {line.split(/(\*[^*]+\*)/g).map((part, j) =>
            part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
              <strong key={j} className="font-semibold">
                {part.slice(1, -1)}
              </strong>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            )
          )}
          {'\n'}
        </Fragment>
      ))}
    </>
  );
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Could not copy - select the text and copy it manually');
  }
}

export function ShareStockDialog({
  settings,
  justSaved = false,
  onOpenAutomation,
  onClose,
}: {
  settings: StockSettings;
  justSaved?: boolean;
  onOpenAutomation: () => void;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useStockMessage();
  const sendNow = useSendStockNow();
  const text = data?.text ?? '';
  const recipients = settings.broadcast.recipients;

  return (
    <Modal
      size="lg"
      title={justSaved ? 'Stock saved - share the update?' : 'Share stock update'}
      description="Written for you in the group’s usual format. Totals are calculated, so they always add up."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary mr-auto h-9 px-3 py-0 text-[13px]">
            {justSaved ? 'Not now' : 'Close'}
          </button>
          <button
            type="button"
            onClick={() => copy(text, 'Message')}
            disabled={!text}
            className="btn-secondary inline-flex h-9 items-center gap-2 px-3 py-0 text-[13px]"
          >
            <CopyIcon />
            Copy message
          </button>
          <a
            href={text ? whatsappShareUrl(text) : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!text}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1f9d55] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#188046] aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            <WhatsAppIcon />
            Open in WhatsApp
          </a>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_220px]">
        {/* Preview, styled like an outgoing WhatsApp message */}
        <div className="rounded-xl bg-[#efeae2] p-3 ring-1 ring-inset ring-black/5">
          {isLoading && (
            <SkeletonRegion label="Building the stock message" className="ml-auto max-w-[85%] space-y-2 rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-3">
              <Skeleton className="h-3.5 w-48 bg-emerald-900/10" />
              {[70, 55, 80, 45, 65, 50, 75, 40].map((w, i) => (
                <Skeleton key={i} className="h-3 bg-emerald-900/10" style={{ width: `${w}%` }} />
              ))}
            </SkeletonRegion>
          )}
          {isError && <p className="p-4 text-[13px] text-red-700">Couldn’t build the message. Try again in a moment.</p>}
          {text && (
            <div className="ml-auto max-w-full rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
              <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.45] text-[#111b21]">
                <WhatsAppText text={text} />
              </pre>
            </div>
          )}
        </div>

        <div className="space-y-4 text-[13px]">
          <div>
            <p className="font-semibold text-slate-900">Post to the group</p>
            <p className="mt-1 leading-relaxed text-slate-500">
              “Open in WhatsApp” fills the message in - pick the stock group and press send.
            </p>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="font-semibold text-slate-900">Send to people directly</p>
            {recipients.length > 0 ? (
              <>
                <p className="mt-1 leading-relaxed text-slate-500">
                  {recipients.length} saved number{recipients.length === 1 ? '' : 's'}.
                  {data && data.parts > 1 && (
                    <> Goes as {data.parts} messages - WhatsApp caps one message at 4,096 characters.</>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => sendNow.mutate()}
                  disabled={sendNow.isPending || !text} aria-busy={sendNow.isPending}
                  className="btn-secondary mt-2 h-8 w-full px-3 py-0 text-[13px]"
                >
                  {sendNow.isPending && <Spinner />}
                  {sendNow.isPending ? 'Sending…' : 'Send now'}
                </button>
                {!settings.whatsappConfigured && (
                  <p className="mt-1.5 text-[12px] leading-snug text-amber-700">
                    WhatsApp sending isn’t connected on the server yet.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 leading-relaxed text-slate-500">
                No numbers saved.{' '}
                <button type="button" onClick={onOpenAutomation} className="font-medium text-brand-700 hover:text-brand-900">
                  Set up automatic sending
                </button>
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="font-semibold text-slate-900">Live stock link</p>
            <p className="mt-1 leading-relaxed text-slate-500">Always current. Pin it in the group once.</p>
            <button
              type="button"
              onClick={() => copy(liveStockUrl(settings.shareToken), 'Live stock link')}
              className="btn-secondary mt-2 inline-flex h-8 w-full items-center justify-center gap-2 px-3 py-0 text-[13px]"
            >
              <LinkIcon />
              Copy link
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WhatsAppIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.26-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.35-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}
