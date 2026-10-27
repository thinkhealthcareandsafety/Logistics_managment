import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';
import { Modal } from '../Modal';
import { Spinner } from '../ui/Loading';

interface Row {
  category: string;
  name: string;
  quantity: number;
  oldQuantity: number | null;
  expiryDates: string[];
  note: string;
  action: 'new' | 'update' | 'same';
  current: { quantity: number; oldQuantity: number | null } | null;
}
interface Preview {
  rows: Row[];
  categories: { name: string; exists: boolean; lines: number; total: number; statedTotal: number | null; totalMismatch: boolean }[];
  skipped: string[];
  untouched: number;
  summary: { newCategories: number; newItems: number; updates: number; unchanged: number };
}

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
const dmy = (iso: string) => iso.split('-').reverse().join('-');

const ACTION = {
  new: { label: 'New', className: 'bg-emerald-50 text-emerald-700' },
  update: { label: 'Update', className: 'bg-amber-50 text-amber-800' },
  same: { label: 'No change', className: 'bg-slate-100 text-slate-500' },
};

/**
 * Paste the stock message from WhatsApp - the app reads the categories, items,
 * quantities, expiry dates and notes, shows exactly what it would change, and applies
 * it only when confirmed. Items the message doesn't mention are left as they are.
 */
export function PasteStockDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);

  const read = useMutation({
    mutationFn: () => apiClient.post<Preview>('/manual-stock/import/preview', { text }).then((r) => r.data),
    onSuccess: setPreview,
    onError: (err) => toast.error(errorMessage(err, 'Could not read that message')),
  });

  const apply = useMutation({
    mutationFn: () =>
      apiClient
        .post<{ categoriesCreated: number; itemsCreated: number; itemsUpdated: number; unchanged: number }>('/manual-stock/import', { text })
        .then((r) => r.data),
    onSuccess: (r) => {
      toast.success(
        `Manual stock updated - ${r.itemsCreated} new item${r.itemsCreated === 1 ? '' : 's'}, ${r.itemsUpdated} updated${r.categoriesCreated ? `, ${r.categoriesCreated} new categor${r.categoriesCreated === 1 ? 'y' : 'ies'}` : ''}`
      );
      queryClient.invalidateQueries({ queryKey: ['manual-stock'] });
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not update the stock')),
  });

  const changes = preview ? preview.summary.newItems + preview.summary.updates + preview.summary.newCategories : 0;

  return (
    <Modal
      size="lg"
      title="Paste stock from WhatsApp"
      description="Copy the stock message from WhatsApp and paste it here - no need to add items one by one."
      onClose={onClose}
      footer={
        preview ? (
          <>
            <button type="button" onClick={() => setPreview(null)} className="btn-secondary mr-auto h-9 px-3 py-0 text-[13px]">
              Back to the text
            </button>
            <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => apply.mutate()}
              disabled={apply.isPending || changes === 0}
              className="btn-primary inline-flex h-9 items-center gap-2 px-4 py-0 text-[13px]"
            >
              {apply.isPending && <Spinner />}
              {changes === 0 ? 'Nothing to change' : 'Update manual stock'}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => read.mutate()}
              disabled={read.isPending || !text.trim()}
              className="btn-primary inline-flex h-9 items-center gap-2 px-4 py-0 text-[13px]"
            >
              {read.isPending && <Spinner />}
              Read message
            </button>
          </>
        )
      }
    >
      {!preview ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            autoFocus
            placeholder={'*AED PADS: 185*\n1.Hs1 Pads: 50\n2.FRX Pads: (22)\n4.G5 pad- (16) 28-11-2028\\28-01-2029\n…'}
            aria-label="Stock message"
            className="input font-mono text-[12px] leading-relaxed"
          />
          <p className="text-[12px] text-slate-500">
            Each block is a category; each line is an item with its quantity - in brackets, after “:” or “-”. Expiry dates (28-11-2028), notes
            like “(3 without pad)” and “(8 old + 40 new)” are picked up too. You’ll see everything before it’s saved.
          </p>
        </div>
      ) : (
        <div className="space-y-4 text-[13px]">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">{preview.summary.newItems} new items</span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">{preview.summary.updates} quantity updates</span>
            {preview.summary.newCategories > 0 && (
              <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-800">{preview.summary.newCategories} new categories</span>
            )}
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{preview.summary.unchanged} unchanged</span>
            {preview.untouched > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{preview.untouched} other items left as they are</span>}
          </div>

          {preview.categories.some((c) => c.totalMismatch) && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              Some category totals in the message don’t add up - the app uses the item lines and works the totals out itself:{' '}
              {preview.categories
                .filter((c) => c.totalMismatch)
                .map((c) => `${c.name} says ${c.statedTotal}, lines add up to ${c.total}`)
                .join('; ')}
              .
            </p>
          )}
          {preview.skipped.length > 0 && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-red-800">
              <p className="font-medium">Couldn’t read {preview.skipped.length} line{preview.skipped.length === 1 ? '' : 's'} - add these by hand if needed:</p>
              <ul className="mt-1 list-disc pl-5 text-[12px]">
                {preview.skipped.slice(0, 10).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="max-h-[48vh] overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-slate-50 text-[12px] text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Quantity</th>
                  <th className="px-3 py-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.categories.map((c) => (
                  <CategoryRows key={c.name} category={c} rows={preview.rows.filter((r) => r.category.toLowerCase() === c.name.toLowerCase())} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CategoryRows({ category, rows }: { category: Preview['categories'][number]; rows: Row[] }) {
  return (
    <>
      <tr className="bg-slate-50/60">
        <td colSpan={3} className="px-3 py-1.5 text-[12px] font-semibold text-slate-700">
          {rows[0]?.category || category.name}
          <span className="ml-2 font-normal text-slate-500">
            {category.exists ? 'existing category' : 'new category'} · {category.total} units
          </span>
        </td>
      </tr>
      {rows.map((r, i) => (
        <tr key={i}>
          <td className="px-3 py-2">
            <span className="text-slate-900">{r.name}</span>
            {(r.note || r.expiryDates.length > 0) && (
              <span className="block text-[11px] text-slate-500">
                {[r.note, r.expiryDates.length ? `exp ${r.expiryDates.map(dmy).join(', ')}` : ''].filter(Boolean).join(' · ')}
              </span>
            )}
          </td>
          <td className="px-3 py-2 text-right tabular-nums">
            {r.current && r.action === 'update' && <span className="text-slate-400 line-through">{r.current.quantity}</span>}{' '}
            <span className="font-semibold text-slate-900">{r.quantity}</span>
            {r.oldQuantity != null && <span className="block text-[11px] text-slate-500">{r.oldQuantity} old + {r.quantity - r.oldQuantity} new</span>}
          </td>
          <td className="px-3 py-2">
            <span className={clsx('rounded-md px-1.5 py-0.5 text-[11px] font-medium', ACTION[r.action].className)}>{ACTION[r.action].label}</span>
          </td>
        </tr>
      ))}
    </>
  );
}
