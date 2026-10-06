import { differenceInCalendarDays } from 'date-fns';
import type { ListStyle, StockItem } from '../types/stock';

/** Pads within this many days of expiry get flagged - enough lead time to sell them first. */
export const EXPIRY_WARNING_DAYS = 90;

export type StockHealth = 'out' | 'low' | 'ok';
export type ExpiryState = 'expired' | 'soon' | 'ok';

export function stockHealth(item: Pick<StockItem, 'quantity' | 'lowStockAt'>, quantity = item.quantity): StockHealth {
  if (quantity === 0) return 'out';
  if (item.lowStockAt != null && quantity <= item.lowStockAt) return 'low';
  return 'ok';
}

/** Expiry dates are calendar dates stored at UTC midnight - compare them as such. */
function toLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function expiryState(iso: string, today = new Date()): ExpiryState {
  const days = differenceInCalendarDays(toLocalDate(iso), today);
  if (days < 0) return 'expired';
  if (days <= EXPIRY_WARNING_DAYS) return 'soon';
  return 'ok';
}

export function itemExpiryState(item: Pick<StockItem, 'expiryDates'>): ExpiryState {
  const states = item.expiryDates.map((d) => expiryState(d));
  if (states.includes('expired')) return 'expired';
  if (states.includes('soon')) return 'soon';
  return 'ok';
}

/** dd-mm-yyyy, matching how the team already writes expiry in the group. */
export function formatExpiry(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

export function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

/** "Crepe Bandage 5×4" - name plus size, for labels, dialogs and messages. */
export function displayName(item: { name: string; size?: string }): string {
  return item.size ? `${item.name} ${item.size}` : item.name;
}

export function listPrefix(style: ListStyle, index: number): string {
  if (style === 'numbers') return `${index + 1}.`;
  if (style === 'letters') return `${String.fromCharCode(65 + (index % 26))}.`;
  return '';
}

export const LIST_STYLE_LABELS: Record<ListStyle, string> = {
  plain: 'No numbering',
  numbers: '1. 2. 3.',
  letters: 'A. B. C.',
};

export function liveStockUrl(token: string): string {
  return `${window.location.origin}/stock/live/${token}`;
}

export function whatsappShareUrl(text: string): string {
  // wa.me with no number opens WhatsApp's own chat picker - that's how the message
  // reaches a group, since the Business API can't post into groups.
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
