import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { marketingApi } from '../../api/marketing';
import { Spinner } from '../ui/Loading';

/**
 * The only conversion point on the marketing site, so it stays a dialog rather than a
 * separate page - a prospect who clicked a plan shouldn't lose the pricing context.
 * Submissions are stored in the database (Lead model); there is no in-app screen for them.
 */
/** Where the dialog was opened from decides its heading and how the lead is filed. */
function describe(source: string): { title: string; subtitle: string; planLabel: string } {
  if (source === 'a demo') {
    return {
      title: 'Book a demo',
      subtitle: 'Thirty minutes, on your own shipments. Tell us a little about your operation and we’ll set it up.',
      planLabel: 'Demo request',
    };
  }
  if (source === 'a question') {
    return {
      title: 'Ask us anything',
      subtitle: 'A real person reads every one of these and replies within one working day.',
      planLabel: 'Question',
    };
  }
  return {
    title: `Talk to us about ${source}`,
    subtitle: 'Tell us a little about your operation and we’ll come back with a straight answer on fit and price.',
    planLabel: source,
  };
}

export function ContactDialog({
  plan: source,
  monthlyShipments,
  onClose,
}: {
  plan: string;
  /** From the pricing slider, so sales knows the volume before the first call. */
  monthlyShipments?: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', company: '', phone: '', message: '' });
  const { title, subtitle, planLabel } = describe(source);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = useMutation({
    mutationFn: () => marketingApi.submitLead({ ...form, plan: planLabel, monthlyShipments }),
  });

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        {submit.isSuccess ? (
          <div className="py-6 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" aria-hidden>
                <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h2 id="contact-title" className="mt-3 text-lg font-semibold text-slate-900">
              Thanks — we’ve got it
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
              Someone from the team will get back to you within one working day.
            </p>
            <button onClick={onClose} className="btn-primary mt-6">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 id="contact-title" className="font-display text-[22px] font-semibold tracking-[-0.01em] text-slate-950">
              {title}
            </h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">{subtitle}</p>

            <div className="mt-5 space-y-3">
              <Field label="Your name" required>
                <input required value={form.name} onChange={(e) => update('name', e.target.value)} className="input" />
              </Field>
              <Field label="Work email" required>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  className="input"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Company">
                  <input value={form.company} onChange={(e) => update('company', e.target.value)} className="input" />
                </Field>
                <Field label="Phone">
                  <input value={form.phone} onChange={(e) => update('phone', e.target.value)} className="input" />
                </Field>
              </div>
              <Field label="Anything we should know?">
                <textarea
                  rows={3}
                  value={form.message}
                  onChange={(e) => update('message', e.target.value)}
                  placeholder="Roughly how many shipments a month, and what's painful today…"
                  className="input resize-y"
                />
              </Field>
            </div>

            {submit.isError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {(submit.error as any)?.response?.data?.message || 'Something went wrong. Please try again.'}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={submit.isPending} aria-busy={submit.isPending} className="btn-primary">
                {submit.isPending && <Spinner />}
                {submit.isPending ? 'Sending…' : 'Send enquiry'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
