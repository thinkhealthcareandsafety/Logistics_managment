import { useState, type FormEvent } from 'react';
import { FormField, Modal } from '../Modal';
import { Spinner } from '../ui/Loading';
import { useCreateStockCategory, useCreateStockItem, useUpdateStockItem } from '../../hooks/useStock';
import { LIST_STYLE_LABELS, displayName, toDateInput } from '../../utils/stock';
import type { ListStyle, StockCategory, StockItem } from '../../types/stock';

const NEW_CATEGORY = '__new__';

/** Add a stock line, or edit an existing line's details (quantity changes go through a count). */
export function StockItemDialog({
  item,
  categories,
  defaultCategoryId,
  onClose,
}: {
  item?: StockItem;
  categories: StockCategory[];
  defaultCategoryId?: string;
  onClose: () => void;
}) {
  const editing = !!item;
  const createItem = useCreateStockItem();
  const updateItem = useUpdateStockItem();
  const createCategory = useCreateStockCategory();

  const [name, setName] = useState(item?.name ?? '');
  const [size, setSize] = useState(item?.size ?? '');
  const [categoryId, setCategoryId] = useState(
    item?.categoryId ?? defaultCategoryId ?? categories[0]?._id ?? NEW_CATEGORY
  );
  const [newCategory, setNewCategory] = useState('');
  const [listStyle, setListStyle] = useState<ListStyle>('numbers');
  const [split, setSplit] = useState(item ? item.oldQuantity != null : false);
  const [quantity, setQuantity] = useState('0');
  const [oldQty, setOldQty] = useState('0');
  const [newQty, setNewQty] = useState('0');
  const [note, setNote] = useState(item?.note ?? '');
  const [internalNote, setInternalNote] = useState(item?.internalNote ?? '');
  const [expiryDates, setExpiryDates] = useState<string[]>(item?.expiryDates.map(toDateInput) ?? []);
  const [lowStockAt, setLowStockAt] = useState(item?.lowStockAt != null ? String(item.lowStockAt) : '');
  const [productCode, setProductCode] = useState(item?.productCode ?? '');

  const pending = createItem.isPending || updateItem.isPending || createCategory.isPending;
  const toInt = (v: string) => Number.parseInt(v, 10) || 0;
  const wasSplit = item?.oldQuantity != null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    let targetCategory = categoryId;
    if (categoryId === NEW_CATEGORY) {
      const created = await createCategory.mutateAsync({ name: newCategory.trim(), listStyle });
      targetCategory = created._id;
    }
    const body = {
      name: name.trim(),
      // "5*4" and "5x4" are how it gets typed; store the proper multiplication sign.
      size: size.trim().replace(/(\d)\s*[*xX]\s*(\d)/g, '$1×$2'),
      categoryId: targetCategory,
      note: note.trim(),
      internalNote: internalNote.trim(),
      expiryDates: expiryDates.filter(Boolean),
      lowStockAt: lowStockAt === '' ? null : Number(lowStockAt),
      productCode: productCode.trim(),
    };
    if (editing) {
      await updateItem.mutateAsync({
        id: item!._id,
        body: { ...body, ...(split !== wasSplit ? { splitOldNew: split } : {}) },
      });
    } else if (split) {
      await createItem.mutateAsync({ ...body, quantity: toInt(oldQty) + toInt(newQty), oldQuantity: toInt(oldQty) });
    } else {
      await createItem.mutateAsync({ ...body, quantity: toInt(quantity) });
    }
    onClose();
  }

  return (
    <Modal
      title={editing ? `Edit ${displayName(item!)}` : 'Add stock item'}
      description={editing ? 'Details only - change the quantity from the stock sheet so it’s logged.' : undefined}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
            Cancel
          </button>
          <button type="submit" form="stock-item-form" disabled={pending} aria-busy={pending} className="btn-primary h-9 px-4 py-0 text-[13px]">
            {pending && <Spinner />}
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
          </button>
        </>
      }
    >
      <form id="stock-item-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_150px]">
          <FormField label="Item name" htmlFor="stock-name">
            <input
              id="stock-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Crepe Bandage"
              className="input"
            />
          </FormField>
          <FormField label="Size" htmlFor="stock-size" optional>
            <input
              id="stock-size"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="e.g. 5×4, Big"
              className="input"
            />
          </FormField>
        </div>

        <FormField label="Category" htmlFor="stock-category">
          <select id="stock-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
            <option value={NEW_CATEGORY}>+ New category…</option>
          </select>
        </FormField>

        {categoryId === NEW_CATEGORY && (
          <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200 sm:grid-cols-[1fr_160px]">
            <FormField label="New category name" htmlFor="stock-new-category">
              <input
                id="stock-new-category"
                required
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Batteries"
                className="input bg-white"
              />
            </FormField>
            <FormField label="Lines listed as" htmlFor="stock-list-style">
              <select
                id="stock-list-style"
                value={listStyle}
                onChange={(e) => setListStyle(e.target.value as ListStyle)}
                className="input bg-white"
              >
                {(Object.keys(LIST_STYLE_LABELS) as ListStyle[]).map((s) => (
                  <option key={s} value={s}>
                    {LIST_STYLE_LABELS[s]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        )}

        {/* Old + new stock, written by hand as "(8) +40 =48" */}
        <div className="rounded-xl ring-1 ring-inset ring-slate-200">
          <label className="flex cursor-pointer items-start gap-3 p-3">
            <input
              type="checkbox"
              checked={split}
              onChange={(e) => setSplit(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-800"
            />
            <span>
              <span className="block text-[13px] font-medium text-slate-900">Track old and new stock separately</span>
              <span className="block text-[12px] text-slate-500">
                For lines like “(8) +40 = 48”. Old stock goes out first.
                {editing && !wasSplit && split && ' Everything counts as new until you enter the old count.'}
                {editing && wasSplit && !split && ' Old and new will merge into one number.'}
              </span>
            </span>
          </label>

          {!editing && (
            <div className="border-t border-slate-100 p-3">
              {split ? (
                <div className="grid grid-cols-3 items-end gap-3">
                  <FormField label="Old" htmlFor="stock-old">
                    <input id="stock-old" type="number" min={0} inputMode="numeric" value={oldQty} onChange={(e) => setOldQty(e.target.value)} className="input" />
                  </FormField>
                  <FormField label="New" htmlFor="stock-new">
                    <input id="stock-new" type="number" min={0} inputMode="numeric" value={newQty} onChange={(e) => setNewQty(e.target.value)} className="input" />
                  </FormField>
                  <p className="pb-2.5 text-[13px] text-slate-500">
                    = <span className="font-semibold tabular-nums text-slate-900">{toInt(oldQty) + toInt(newQty)}</span> total
                  </p>
                </div>
              ) : (
                <FormField label="Quantity in stock" htmlFor="stock-qty">
                  <input
                    id="stock-qty"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="input"
                  />
                </FormField>
              )}
            </div>
          )}
        </div>

        <FormField
          label="Note in the WhatsApp update"
          htmlFor="stock-note"
          optional
          hint="Shown in brackets after the number, e.g. “3 without pad”."
        >
          <input id="stock-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 3 without pad" className="input" />
        </FormField>

        <FormField
          label="Private note"
          htmlFor="stock-internal-note"
          optional
          hint="Only visible here - never sent to WhatsApp or shown on the live link."
        >
          <textarea
            id="stock-internal-note"
            rows={2}
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="e.g. 7 blocked for Bengaluru training"
            className="input resize-y"
          />
        </FormField>

        <FormField label="Expiry dates" optional hint="One per batch. Flagged on the sheet 90 days before they expire.">
          <div className="space-y-2">
            {expiryDates.map((date, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="date"
                  aria-label={`Expiry date ${i + 1}`}
                  value={date}
                  onChange={(e) => setExpiryDates((all) => all.map((d, j) => (j === i ? e.target.value : d)))}
                  className="input"
                />
                <button
                  type="button"
                  onClick={() => setExpiryDates((all) => all.filter((_, j) => j !== i))}
                  aria-label={`Remove expiry date ${i + 1}`}
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg text-slate-400 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 hover:text-red-600"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setExpiryDates((all) => [...all, ''])}
              className="text-[13px] font-medium text-brand-700 hover:text-brand-900"
            >
              + Add expiry date
            </button>
          </div>
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Low-stock alert at" htmlFor="stock-low" optional hint="Flag the line when it drops to this.">
            <input
              id="stock-low"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={lowStockAt}
              onChange={(e) => setLowStockAt(e.target.value)}
              placeholder="e.g. 10"
              className="input"
            />
          </FormField>
          <FormField
            label="Linked product code"
            htmlFor="stock-code"
            optional
            hint="Shipments booked with this code deduct from this line automatically."
          >
            <input
              id="stock-code"
              value={productCode}
              onChange={(e) => setProductCode(e.target.value.toUpperCase())}
              placeholder="e.g. PAD-HS1"
              className="input font-mono uppercase placeholder:font-sans placeholder:normal-case"
            />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
