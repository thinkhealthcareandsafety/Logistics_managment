import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { compressImage } from '../../utils/image';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import { Spinner } from '../ui/Loading';

export type Relation = 'self' | 'security' | 'reception' | 'colleague' | 'family' | 'other';
export type Condition = 'good' | 'damaged' | 'partial';

/** Labels in English with Hindi beneath - the person at the gate may read either. */
export const RELATIONS: { value: Relation; label: string; hi: string }[] = [
  { value: 'self', label: 'The client (myself)', hi: 'खुद (ग्राहक)' },
  { value: 'security', label: 'Security / watchman', hi: 'सिक्योरिटी / वॉचमैन' },
  { value: 'reception', label: 'Reception / front desk', hi: 'रिसेप्शन' },
  { value: 'colleague', label: 'Colleague / staff', hi: 'सहकर्मी / स्टाफ' },
  { value: 'family', label: 'Family member', hi: 'परिवार का सदस्य' },
  { value: 'other', label: 'Someone else', hi: 'अन्य' },
];

export const CONDITIONS: { value: Condition; label: string; hi: string }[] = [
  { value: 'good', label: 'Received in good condition', hi: 'ठीक हालत में मिला' },
  { value: 'damaged', label: 'Box damaged', hi: 'बॉक्स खराब / टूटा हुआ' },
  { value: 'partial', label: 'Some items missing', hi: 'कुछ सामान कम है' },
];

export const relationLabel = (r: string) => RELATIONS.find((x) => x.value === r)?.label || r;
export const conditionLabel = (c: string) => CONDITIONS.find((x) => x.value === c)?.label || c;

export interface ReceiptDraft {
  receivedBy: string;
  relation: Relation | '';
  relationNote: string;
  phone: string;
  condition: Condition;
  remarks: string;
}

export interface ReceiptSubmission extends ReceiptDraft {
  /** When they pressed submit - kept even if it's sent later, once there's internet. */
  receivedAt: string;
  photos: Blob[];
  signature: Blob;
  location?: { lat: number; lng: number; accuracy: number };
}

export const EMPTY_DRAFT: ReceiptDraft = { receivedBy: '', relation: '', relationNote: '', phone: '', condition: 'good', remarks: '' };
const MAX_PHOTOS = 3;

function Label({ children, hi, htmlFor, bilingual }: { children: ReactNode; hi: string; htmlFor?: string; bilingual: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[13px] font-medium text-slate-800">
      {children}
      {bilingual && <span className="ml-1.5 font-normal text-slate-500">· {hi}</span>}
    </label>
  );
}

/**
 * Who received the parcel, their photo and signature. Used by the receiver on the
 * receipt link (bilingual, camera-first) and by staff recording a receipt the client
 * sent some other way. `onDraft` lets the page keep typed answers if it's closed.
 */
export function ReceiptForm({
  bilingual,
  initial = EMPTY_DRAFT,
  onDraft,
  onSubmit,
  submitLabel,
}: {
  bilingual: boolean;
  initial?: ReceiptDraft;
  onDraft?: (draft: ReceiptDraft) => void;
  onSubmit: (submission: ReceiptSubmission) => Promise<void>;
  submitLabel: string;
}) {
  const [draft, setDraft] = useState<ReceiptDraft>(initial);
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [signed, setSigned] = useState(false);
  // Staff only: a picture of the signature the client sent, instead of drawing it.
  const [signatureFile, setSignatureFile] = useState<{ blob: Blob; url: string } | null>(null);
  const [shareLocation, setShareLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signature = useRef<SignaturePadHandle>(null);

  const set = <K extends keyof ReceiptDraft>(key: K, value: ReceiptDraft[K]) =>
    setDraft((d) => {
      const next = { ...d, [key]: value };
      onDraft?.(next);
      return next;
    });

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    try {
      const room = MAX_PHOTOS - photos.length;
      const added = await Promise.all([...files].slice(0, room).map((f) => compressImage(f)));
      setPhotos((p) => [...p, ...added.map((blob) => ({ blob, url: URL.createObjectURL(blob) }))]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function location(): Promise<ReceiptSubmission['location']> {
    if (!shareLocation || !navigator.geolocation) return Promise.resolve(undefined);
    return new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
        () => resolve(undefined),
        { timeout: 8000, maximumAge: 300_000 }
      )
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (draft.receivedBy.trim().length < 2) return setError('Enter the name of the person receiving the parcel');
    if (!draft.relation) return setError('Choose who is receiving it');
    if (!photos.length) return setError('Add at least one photo of the parcel or the person receiving it');
    const sig = signatureFile?.blob || (await signature.current?.toBlob());
    if (!sig) return setError('Please sign in the box');
    setBusy(true);
    try {
      await onSubmit({
        ...draft,
        receivedAt: new Date().toISOString(),
        photos: photos.map((p) => p.blob),
        signature: sig,
        location: await location(),
      });
    } catch (err) {
      setError((err as Error).message || 'Could not submit - please try again');
    } finally {
      setBusy(false);
    }
  }

  const input = 'input';
  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <Label htmlFor="rc-name" hi="पार्सल लेने वाले का नाम" bilingual={bilingual}>
          Name of the person receiving
        </Label>
        <input id="rc-name" className={input} value={draft.receivedBy} onChange={(e) => set('receivedBy', e.target.value)} maxLength={80} autoComplete="name" />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-slate-800">
          Who is receiving it?{bilingual && <span className="ml-1.5 font-normal text-slate-500">· आप कौन हैं?</span>}
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {RELATIONS.map((r) => (
            <label
              key={r.value}
              className={clsx(
                'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[13px] transition',
                draft.relation === r.value ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 hover:border-slate-300'
              )}
            >
              <input type="radio" name="relation" value={r.value} checked={draft.relation === r.value} onChange={() => set('relation', r.value)} className="mt-0.5 accent-brand-800" />
              <span>
                <span className="block font-medium text-slate-800">{r.label}</span>
                {bilingual && <span className="block text-[12px] text-slate-500">{r.hi}</span>}
              </span>
            </label>
          ))}
        </div>
        {draft.relation && draft.relation !== 'self' && (
          <input
            className={clsx(input, 'mt-2')}
            placeholder={draft.relation === 'other' ? 'Who? e.g. driver, store keeper' : 'Optional - e.g. Gate 2, 3rd floor'}
            aria-label="More about who received it"
            value={draft.relationNote}
            onChange={(e) => set('relationNote', e.target.value)}
            maxLength={80}
          />
        )}
      </fieldset>

      <div>
        <Label htmlFor="rc-phone" hi="मोबाइल नंबर (वैकल्पिक)" bilingual={bilingual}>
          Mobile number (optional)
        </Label>
        <input id="rc-phone" className={input} inputMode="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} maxLength={20} autoComplete="tel" />
      </div>

      <div>
        <Label hi="पार्सल की फ़ोटो" bilingual={bilingual}>
          Photo of the parcel or the person receiving it
        </Label>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.url} className="relative">
              <img src={p.url} alt={`Photo ${i + 1}`} className="h-24 w-24 rounded-lg border border-slate-200 object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((list) => list.filter((x) => x !== p))}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[12px] text-white"
              >
                ×
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-center text-[12px] text-slate-600 hover:border-brand-500">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              {photos.length ? 'Add another' : bilingual ? 'Take photo · फ़ोटो लें' : 'Add photo'}
              <input
                type="file"
                accept="image/*"
                capture={bilingual ? 'environment' : undefined}
                multiple={!bilingual}
                className="sr-only"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
      </div>

      <div>
        <Label hi="पार्सल की हालत" bilingual={bilingual}>
          Condition
        </Label>
        <select className={input} value={draft.condition} onChange={(e) => set('condition', e.target.value as Condition)}>
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
              {bilingual ? ` · ${c.hi}` : ''}
            </option>
          ))}
        </select>
        {draft.condition !== 'good' && (
          <textarea
            className={clsx(input, 'mt-2')}
            rows={2}
            placeholder="What’s wrong?"
            aria-label="Describe the problem"
            value={draft.remarks}
            onChange={(e) => set('remarks', e.target.value)}
            maxLength={500}
          />
        )}
      </div>

      <div>
        <Label hi="यहाँ उंगली से हस्ताक्षर करें" bilingual={bilingual}>
          Signature of the person receiving
        </Label>
        {signatureFile ? (
          <div className="flex items-end gap-3">
            <img src={signatureFile.url} alt="Signature picture" className="h-24 rounded-lg border border-slate-200 bg-white object-contain" />
            <button type="button" onClick={() => setSignatureFile(null)} className="text-[12px] font-medium text-brand-700 hover:text-brand-900">
              Draw instead
            </button>
          </div>
        ) : (
          <SignaturePad ref={signature} label={bilingual ? 'Sign here with your finger · यहाँ हस्ताक्षर करें' : 'Sign here'} onChange={setSigned} />
        )}
        {!bilingual && !signatureFile && (
          <label className="mt-1 inline-block cursor-pointer text-[12px] font-medium text-brand-700 hover:text-brand-900">
            Or upload a picture of the signature the client sent
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const blob = await compressImage(f, 1000, 0.8);
                  setSignatureFile({ blob, url: URL.createObjectURL(blob) });
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </label>
        )}
      </div>

      <label className="flex items-start gap-2 text-[13px] text-slate-700">
        <input type="checkbox" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} className="mt-0.5 accent-brand-800" />
        <span>
          Add my location as proof (optional)
          {bilingual && <span className="block text-[12px] text-slate-500">लोकेशन जोड़ें (वैकल्पिक)</span>}
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} aria-busy={busy} className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3 text-[15px]">
        {busy && <Spinner />}
        {submitLabel}
      </button>
      {!signed && <span className="sr-only">Signature not drawn yet</span>}
    </form>
  );
}
