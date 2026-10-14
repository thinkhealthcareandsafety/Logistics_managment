import { createContext, useContext, type ReactNode } from 'react';

/**
 * Which stock book a page is showing: the main stock (kept in step with Zoho Books) or
 * the manual stock the logistics head keeps by hand. The Stock page, its dialogs and
 * hooks all read this, so one page serves both - with Zoho-only parts hidden for manual.
 */
export type LedgerKind = 'zoho' | 'manual';

export interface Ledger {
  kind: LedgerKind;
  /** API base for the sheet. */
  base: string;
  /** Query-cache root, so the two books never share cached data. */
  key: string;
  /** Path of the read-only live page in this app. */
  livePath: string;
  /** API path of the read-only live data. */
  publicBase: string;
  title: string;
}

export const LEDGERS: Record<LedgerKind, Ledger> = {
  zoho: { kind: 'zoho', base: '/stock', key: 'stock', livePath: '/stock/live', publicBase: '/public/stock', title: 'Stock' },
  manual: {
    kind: 'manual',
    base: '/manual-stock',
    key: 'manual-stock',
    livePath: '/manual-stock/live',
    publicBase: '/public/manual-stock',
    title: 'Manual stock',
  },
};

const LedgerContext = createContext<Ledger>(LEDGERS.zoho);

export function StockLedgerProvider({ kind, children }: { kind: LedgerKind; children: ReactNode }) {
  return <LedgerContext.Provider value={LEDGERS[kind]}>{children}</LedgerContext.Provider>;
}

export const useLedger = () => useContext(LedgerContext);
