import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { shipmentsApi } from '../api/shipments';
import { LabelFileError, prepareLabelFile } from '../utils/labelImage';
import type { LabelDraft, LabelField } from '../types/shipment';

export const LABEL_FIELD_NAMES: Record<LabelField, string> = {
  trackingNumber: 'AWB',
  courier: 'courier',
  customerName: 'customer name',
  customerPhone: 'phone',
  customerEmail: 'email',
  address: 'address',
  pincode: 'pincode',
  productName: 'product',
  quantity: 'quantity',
  weightKg: 'weight',
  freightAmount: 'freight',
  shippingDate: 'shipping date',
  estimatedDelivery: 'promised delivery',
};

type State =
  | { kind: 'idle' }
  | { kind: 'reading'; preview: string | null; name: string }
  | { kind: 'done'; preview: string | null; name: string; draft: LabelDraft; filled: number }
  | { kind: 'error'; preview: string | null; message: string };

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';

function list(words: string[]) {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * "Scan label": a photo of the shipping label or booking slip -> the form below fills
 * itself in. Fields the reader wasn't sure of are named here and outlined in amber
 * below, and nothing is saved until the person presses Add shipment.
 */
export function LabelScanner({
  initialFile,
  onDraft,
  countFilled,
}: {
  initialFile?: File | null;
  onDraft: (draft: LabelDraft) => void;
  countFilled: (draft: LabelDraft) => number;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const runId = useRef(0);
  const previewRef = useRef<string | null>(null);

  // Free the object URL of the previous preview.
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  async function read(file: File) {
    const id = ++runId.current;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    let prepared;
    try {
      prepared = await prepareLabelFile(file);
    } catch (err) {
      setState({ kind: 'error', preview: null, message: err instanceof LabelFileError ? err.message : 'Couldn’t open that file.' });
      return;
    }
    previewRef.current = prepared.previewUrl;
    setState({ kind: 'reading', preview: prepared.previewUrl, name: file.name });
    try {
      const draft = await shipmentsApi.extractFromLabel(prepared.blob, prepared.name);
      if (id !== runId.current) return;
      onDraft(draft);
      setState({ kind: 'done', preview: prepared.previewUrl, name: file.name, draft, filled: countFilled(draft) });
    } catch (err: unknown) {
      if (id !== runId.current) return;
      const e = err as { response?: { data?: { message?: string } }; code?: string };
      const message =
        e.response?.data?.message ||
        (e.code === 'ECONNABORTED' ? 'Reading the label took too long - try a clearer photo.' : 'Couldn’t read that label - try again.');
      setState({ kind: 'error', preview: prepared.previewUrl, message });
    }
  }

  // Opened from the dashboard's "Scan label" button with a photo already chosen.
  // Read each file once - effects can run twice in development, and every read is a paid API call.
  const startedFor = useRef<File | null>(null);
  useEffect(() => {
    if (initialFile && startedFor.current !== initialFile) {
      startedFor.current = initialFile;
      void read(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (file) void read(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files);
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => pick(e.target.files)}
    />
  );
  const choose = () => inputRef.current?.click();

  if (state.kind === 'idle') {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx(
          'flex flex-col gap-3 rounded-lg border border-dashed px-4 py-3.5 transition sm:flex-row sm:items-center',
          dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50/60'
        )}
      >
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-brand-700 ring-1 ring-slate-200">
          <CameraIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-900">Scan the label to fill this in</p>
          <p className="text-[12px] leading-snug text-slate-500">
            Drop a photo of the shipping label or booking slip, or take one. You check the details before adding.
          </p>
        </div>
        <button type="button" onClick={choose} className="btn-secondary h-9 shrink-0 px-3 py-0 text-[13px]">
          Choose photo
        </button>
        {input}
      </div>
    );
  }

  const uncertain = state.kind === 'done' ? state.draft.uncertainFields.map((f) => LABEL_FIELD_NAMES[f]) : [];

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={clsx(
        'flex gap-3 rounded-lg border px-3 py-3',
        state.kind === 'error' ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-slate-50/60'
      )}
      aria-live="polite"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-slate-200">
        {state.preview ? (
          <img src={state.preview} alt="The label you uploaded" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-[11px] font-semibold text-slate-400">PDF</span>
        )}
      </div>
      <div className="min-w-0 flex-1 text-[13px]">
        {state.kind === 'reading' && (
          <>
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              Reading the label…
            </p>
            <p className="mt-0.5 text-[12px] text-slate-500">This usually takes 10–30 seconds.</p>
          </>
        )}
        {state.kind === 'error' && (
          <>
            <p className="font-semibold text-rose-800">Couldn’t fill the form from this file</p>
            <p className="mt-0.5 text-[12px] leading-snug text-rose-700">{state.message}</p>
          </>
        )}
        {state.kind === 'done' && (
          <>
            <p className="font-semibold text-slate-900">
              {state.filled > 0
                ? `Filled ${state.filled} field${state.filled === 1 ? '' : 's'} from the label`
                : 'Nothing readable on this label'}
            </p>
            {state.draft.existingShipmentId ? (
              <p className="mt-0.5 text-[12px] leading-snug text-rose-700">
                {state.draft.trackingNumber} is already being tracked.{' '}
                <Link to={`/shipments/${state.draft.existingShipmentId}`} className="font-medium underline underline-offset-2">
                  Open it
                </Link>
              </p>
            ) : uncertain.length > 0 ? (
              <p className="mt-0.5 text-[12px] leading-snug text-amber-800">
                Check the {list(uncertain)} - {uncertain.length === 1 ? 'it was' : 'they were'} hard to read. Outlined below.
              </p>
            ) : (
              <p className="mt-0.5 text-[12px] leading-snug text-slate-500">Give it a quick look, then add the shipment.</p>
            )}
            {state.draft.printedCourierName && !state.draft.carrierCode && (
              <p className="mt-0.5 text-[12px] leading-snug text-amber-800">
                The label says “{state.draft.printedCourierName}” - pick the matching courier below.
              </p>
            )}
            {state.draft.notes && <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{state.draft.notes}</p>}
          </>
        )}
        {state.kind !== 'reading' && (
          <button
            type="button"
            onClick={choose}
            className="mt-1.5 rounded text-[12px] font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            {state.kind === 'error' ? 'Try another photo' : 'Scan a different label'}
          </button>
        )}
      </div>
      {input}
    </div>
  );
}

export function CameraIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className={className} aria-hidden>
      <path
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h1.6l1.2-1.6A1 1 0 0 1 8.1 3h3.8a1 1 0 0 1 .8.4L13.9 5h1.6A1.5 1.5 0 0 1 17 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-8Z"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10.5" r="3" />
    </svg>
  );
}
