import { useState, type FormEvent } from 'react';
import { FormField, Modal } from '../Modal';
import { useStockOut } from '../../hooks/useStock';
import { displayName } from '../../utils/stock';
import type { StockItem } from '../../types/stock';
import { Spinner } from '../ui/Loading';

/**
 * Records goods leaving to a customer - the "Stock Out" block of the WhatsApp update.
 * The customer is who it went to, not a product; it shows in today's message as
 * "HS1 Pads - 2 to RBS Industrial".
 */
export function StockOutDialog({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const stockOut = useStockOut();
  const [quantity, setQuantity] = useState('1');
  const [customer, setCustomer] = useState('');
  const [note, setNote] = useState('');

  const qty = Number.parseInt(quantity, 10) || 0;
  const tooMany = qty > item.quantity;
  const split = item.oldQuantity != null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (qty <= 0 || tooMany) return;
    await stockOut.mutateAsync({ id: item._id, body: { quantity: qty, customer: customer.trim(), note: note.trim() } });
    onClose();
  }

  return (
    <Modal
      title={`Stock out - ${displayName(item)}`}
      description={
        <>
          {item.quantity} in stock
          {split && ` (${item.oldQuantity} old + ${item.quantity - (item.oldQuantity ?? 0)} new - old goes out first)`}
        </>
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
            Cancel
          </button>
          <button
            type="submit"
            form="stock-out-form"
            disabled={stockOut.isPending || qty <= 0 || tooMany} aria-busy={stockOut.isPending}
            className="btn-primary h-9 px-4 py-0 text-[13px]"
          >
            {stockOut.isPending && <Spinner />}
            {stockOut.isPending ? 'Saving…' : 'Record stock out'}
          </button>
        </>
      }
    >
      <form id="stock-out-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr]">
          <FormField label="Quantity" htmlFor="out-qty">
            <input
              id="out-qty"
              type="number"
              min={1}
              max={item.quantity}
              inputMode="numeric"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              aria-invalid={tooMany}
              className="input"
            />
          </FormField>
          <FormField label="Sent to (customer)" htmlFor="out-customer" optional>
            <input
              id="out-customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="e.g. RBS Industrial"
              className="input"
            />
          </FormField>
        </div>
        {tooMany && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-inset ring-red-200">
            Only {item.quantity} in stock. If the shelf really has more, correct the count first.
          </p>
        )}
        <FormField label="Note" htmlFor="out-note" optional>
          <input
            id="out-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. invoice number, courier"
            className="input"
          />
        </FormField>
        <p className="text-[12px] leading-relaxed text-slate-500">
          Appears in today’s WhatsApp update under “Stock Out”, and in Recent changes.
        </p>
      </form>
    </Modal>
  );
}
