import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  useDeleteStockCategory,
  useRemoveStockItem,
  useSaveInternalNote,
  useSaveStockCount,
  useStock,
  useStockMovements,
  useUpdateStockCategory,
  useZohoStatus,
} from '../hooks/useStock';
import { ZohoBooksDialog } from '../components/stock/ZohoBooksDialog';
import { SegmentedControl } from '../components/SegmentedControl';
import { Menu, MenuDivider, MenuItem } from '../components/Menu';
import { FormField, Modal } from '../components/Modal';
import { StockItemDialog } from '../components/stock/StockItemDialog';
import { StockOutDialog } from '../components/stock/StockOutDialog';
import { ShareStockDialog, WhatsAppIcon } from '../components/stock/ShareStockDialog';
import { StockAutomationDialog } from '../components/stock/StockAutomationDialog';
import {
  LIST_STYLE_LABELS,
  displayName,
  expiryState,
  formatExpiry,
  itemExpiryState,
  listPrefix,
  stockHealth,
} from '../utils/stock';
import type { ListStyle, StockCategory, StockCountChange, StockItem, StockMovement } from '../types/stock';

type Filter = 'all' | 'out' | 'low' | 'expiring';

/**
 * Staged counts, keyed by item id. Split lines (old + new) keep the two halves
 * separately under "<id>:old" and "<id>:new"; plain lines use "<id>".
 */
type Drafts = Record<string, string>;

const toInt = (v: string | undefined) => Number.parseInt(v ?? '', 10) || 0;

function draftOld(item: StockItem, drafts: Drafts) {
  const d = drafts[`${item._id}:old`];
  return d === undefined ? (item.oldQuantity ?? 0) : toInt(d);
}

function draftNew(item: StockItem, drafts: Drafts) {
  const d = drafts[`${item._id}:new`];
  return d === undefined ? item.quantity - (item.oldQuantity ?? 0) : toInt(d);
}

function draftTotal(item: StockItem, drafts: Drafts) {
  if (item.oldQuantity != null) return draftOld(item, drafts) + draftNew(item, drafts);
  const d = drafts[item._id];
  return d === undefined ? item.quantity : toInt(d);
}

function isChanged(item: StockItem, drafts: Drafts) {
  if (item.oldQuantity != null) {
    return draftOld(item, drafts) !== item.oldQuantity || draftTotal(item, drafts) !== item.quantity;
  }
  return draftTotal(item, drafts) !== item.quantity;
}

function matches(filter: Filter, item: StockItem) {
  if (filter === 'out') return item.quantity === 0;
  if (filter === 'low') return stockHealth(item) === 'low';
  if (filter === 'expiring') return itemExpiryState(item) !== 'ok';
  return true;
}

export function Stock() {
  const { data, isLoading, isError } = useStock();
  const saveCount = useSaveStockCount();

  // Count-in-progress: edits are staged locally and saved together, the way a shelf
  // count actually happens - walk the shelf, then publish once.
  const [drafts, setDrafts] = useState<Drafts>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const [dialog, setDialog] = useState<
    | { kind: 'share'; justSaved?: boolean }
    | { kind: 'automation' }
    | { kind: 'item'; item?: StockItem; categoryId?: string }
    | { kind: 'stockOut'; item: StockItem }
    | { kind: 'category'; category: StockCategory }
    | { kind: 'zoho' }
    | null
  >(null);

  const { data: zoho } = useZohoStatus();
  // While Zoho Books is connected, linked lines take their number from Zoho only.
  const zohoLive = !!zoho?.connected;
  const isLocked = (item: StockItem) => zohoLive && !!item.zohoItemId;

  // Back from Zoho's sign-in: say how it went, then tidy the URL.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const outcome = params.get('zoho');
    if (!outcome) return;
    if (outcome === 'connected') toast.success('Zoho Books connected - syncing stock now');
    else if (outcome === 'error') toast.error(params.get('message') || 'Couldn’t connect Zoho Books');
    setDialog({ kind: 'zoho' });
    setParams({}, { replace: true });
  }, [params, setParams]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const categories = useMemo(() => data?.categories ?? [], [data]);

  const changes: StockCountChange[] = items
    .filter((i) => isChanged(i, drafts))
    .map((i) =>
      i.oldQuantity != null
        ? { itemId: i._id, quantity: draftTotal(i, drafts), oldQuantity: draftOld(i, drafts) }
        : { itemId: i._id, quantity: draftTotal(i, drafts) }
    );
  const dirty = changes.length > 0;

  // Losing a half-done count to a stray tab close is the fastest way to lose trust.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const summary = useMemo(() => {
    let units = 0;
    const out: StockItem[] = [];
    let low = 0;
    let expiring = 0;
    let nextExpiry: string | null = null;
    for (const item of items) {
      units += item.quantity;
      if (item.quantity === 0) out.push(item);
      if (stockHealth(item) === 'low') low += 1;
      if (itemExpiryState(item) !== 'ok') expiring += 1;
      for (const d of item.expiryDates) if (!nextExpiry || d < nextExpiry) nextExpiry = d;
    }
    return { units, out, low, expiring, nextExpiry, withThreshold: items.filter((i) => i.lowStockAt != null).length };
  }, [items]);

  const query = search.trim().toLowerCase();
  const visibleItems = items.filter(
    (i) =>
      matches(filter, i) &&
      (!query ||
        [displayName(i), i.note, i.internalNote, i.productCode].some((f) => f?.toLowerCase().includes(query)))
  );
  const narrowed = filter !== 'all' || !!query;

  function setDraft(key: string, value: string) {
    setDrafts((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    await saveCount.mutateAsync(changes);
    setDrafts({});
    setDialog({ kind: 'share', justSaved: true });
  }

  if (isLoading) return <StockSkeleton />;
  if (isError || !data) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm font-semibold text-slate-900">Couldn’t load stock</p>
        <p className="mt-1 text-[13px] text-slate-500">Check your connection and refresh the page.</p>
      </div>
    );
  }

  const { settings } = data;
  const shownCategories = categories.filter(
    (c) => !narrowed || visibleItems.some((i) => i.categoryId === c._id)
  );

  return (
    <div className={clsx('space-y-6', dirty && 'pb-24')}>
      {/* ───────── Header ───────── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-slate-950">Stock</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
            {settings.lastCountAt ? (
              <span>
                Last counted {format(new Date(settings.lastCountAt), 'd MMM, h:mm a')}
                {settings.lastCountBy && ` by ${settings.lastCountBy}`}
              </span>
            ) : (
              <span>Not counted yet</span>
            )}
            <span aria-hidden className="text-slate-300">/</span>
            <button
              onClick={() => setDialog({ kind: 'automation' })}
              className="inline-flex items-center gap-1.5 rounded font-medium text-brand-700 hover:text-brand-900"
            >
              <span
                aria-hidden
                className={clsx('h-1.5 w-1.5 rounded-full', settings.broadcast.enabled ? 'bg-emerald-500' : 'bg-slate-300')}
              />
              {settings.broadcast.enabled
                ? `Daily update at ${formatTime(settings.broadcast.time)}`
                : 'Automatic update off'}
            </button>
            <span aria-hidden className="text-slate-300">/</span>
            <button
              onClick={() => setDialog({ kind: 'zoho' })}
              className="inline-flex items-center gap-1.5 rounded font-medium text-brand-700 hover:text-brand-900"
            >
              <span
                aria-hidden
                className={clsx(
                  'h-1.5 w-1.5 rounded-full',
                  !zohoLive ? 'bg-slate-300' : zoho?.lastSyncOk === false ? 'bg-red-500' : 'bg-emerald-500'
                )}
              />
              {!zohoLive
                ? 'Connect Zoho Books'
                : zoho?.lastSyncOk === false
                  ? 'Zoho Books sync failing'
                  : zoho?.lastSyncAt
                    ? `Zoho Books · synced ${formatDistanceToNow(new Date(zoho.lastSyncAt), { addSuffix: true })}`
                    : 'Zoho Books · first sync running'}
            </button>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setDialog({ kind: 'automation' })} className="btn-secondary inline-flex items-center gap-2">
            <BoltIcon />
            Automate
          </button>
          <button onClick={() => setDialog({ kind: 'item' })} className="btn-secondary inline-flex items-center gap-2">
            <PlusIcon />
            Add item
          </button>
          <button
            onClick={() => setDialog({ kind: 'share' })}
            disabled={dirty}
            title={dirty ? 'Save your count first' : undefined}
            className="btn-primary inline-flex items-center gap-2"
          >
            <WhatsAppIcon />
            Share update
          </button>
        </div>
      </header>

      {/* ───────── Summary ───────── */}
      <section
        aria-label="Stock summary"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:grid-cols-4"
      >
        <Metric
          label="Units in stock"
          value={summary.units}
          detail={`${items.length} lines across ${categories.length} categories`}
        />
        <Metric
          label="Out of stock"
          value={summary.out.length}
          tone={summary.out.length ? 'danger' : undefined}
          detail={summary.out.length ? 'Tap to see which lines' : 'Everything has stock'}
          selected={filter === 'out'}
          onClick={summary.out.length ? () => setFilter(filter === 'out' ? 'all' : 'out') : undefined}
        />
        <Metric
          label="Running low"
          value={summary.low}
          tone={summary.low ? 'warn' : undefined}
          detail={summary.withThreshold ? `${summary.withThreshold} lines have a low-stock level` : 'Set a low-stock level on any item'}
          selected={filter === 'low'}
          onClick={summary.low ? () => setFilter(filter === 'low' ? 'all' : 'low') : undefined}
        />
        <Metric
          label="Expiring in 90 days"
          value={summary.expiring}
          tone={summary.expiring ? 'warn' : undefined}
          detail={summary.nextExpiry ? `Next expiry ${formatExpiry(summary.nextExpiry)}` : 'No expiry dates recorded'}
          selected={filter === 'expiring'}
          onClick={summary.expiring ? () => setFilter(filter === 'expiring' ? 'all' : 'expiring') : undefined}
        />
      </section>

      {/* ───────── Toolbar ───────── */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-72">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find an item or note…"
              aria-label="Find an item or note"
              className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[13px] text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            <SegmentedControl<Filter>
              label="Show"
              value={filter}
              onChange={setFilter}
              segments={[
                { value: 'all', label: 'All items', count: items.length },
                { value: 'out', label: 'Out of stock', count: summary.out.length, dot: 'bg-red-500' },
                { value: 'low', label: 'Low', count: summary.low, dot: 'bg-amber-500' },
                { value: 'expiring', label: 'Expiring', count: summary.expiring, dot: 'bg-amber-500' },
              ]}
            />
          </div>
        </div>

        {/* Jump list - thirteen categories is too long to scroll blind. */}
        {shownCategories.length > 3 && (
          <nav aria-label="Jump to category" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-1.5">
              {shownCategories.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() =>
                    document.getElementById(`stock-cat-${c._id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                  className="shrink-0 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </nav>
        )}
      </div>

      {/* ───────── Stock sheet ───────── */}
      {categories.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <p className="text-sm font-semibold text-slate-900">No stock set up yet</p>
          <p className="mt-1 text-[13px] text-slate-500">Add your first item - you’ll create its category at the same time.</p>
          <button onClick={() => setDialog({ kind: 'item' })} className="btn-primary mt-5">
            Add item
          </button>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <p className="text-sm font-semibold text-slate-900">Nothing matches</p>
          <p className="mt-1 text-[13px] text-slate-500">Try another filter or clear the search.</p>
          <button
            onClick={() => {
              setFilter('all');
              setSearch('');
            }}
            className="btn-secondary mt-5"
          >
            Show all items
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {shownCategories.map((category) => {
            const all = items.filter((i) => i.categoryId === category._id);
            return (
              <CategorySection
                key={category._id}
                category={category}
                allItems={all}
                items={narrowed ? visibleItems.filter((i) => i.categoryId === category._id) : all}
                drafts={drafts}
                onDraft={setDraft}
                isLocked={isLocked}
                onOpenZoho={() => setDialog({ kind: 'zoho' })}
                onAddItem={() => setDialog({ kind: 'item', categoryId: category._id })}
                onEditItem={(item) => setDialog({ kind: 'item', item })}
                onStockOut={(item) => setDialog({ kind: 'stockOut', item })}
                onEditCategory={() => setDialog({ kind: 'category', category })}
              />
            );
          })}
        </div>
      )}

      <RecentChanges />

      {/* ───────── Save bar ───────── */}
      <div
        className={clsx(
          'fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur transition-transform duration-200',
          dirty ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        )}
        aria-hidden={!dirty}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="text-[13px] text-slate-700">
            <span className="font-semibold tabular-nums">{changes.length}</span> line{changes.length === 1 ? '' : 's'} changed
            <span className="hidden text-slate-500 sm:inline"> - save to update the sheet and the WhatsApp message.</span>
          </p>
          <div className="flex gap-2">
            <button onClick={() => setDrafts({})} className="btn-secondary h-9 px-3 py-0 text-[13px]" tabIndex={dirty ? 0 : -1}>
              Discard
            </button>
            <button
              onClick={save}
              disabled={saveCount.isPending}
              className="btn-primary h-9 px-4 py-0 text-[13px]"
              tabIndex={dirty ? 0 : -1}
            >
              {saveCount.isPending ? 'Saving…' : 'Save count'}
            </button>
          </div>
        </div>
      </div>

      {/* ───────── Dialogs ───────── */}
      {dialog?.kind === 'share' && (
        <ShareStockDialog
          settings={settings}
          justSaved={dialog.justSaved}
          onOpenAutomation={() => setDialog({ kind: 'automation' })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'automation' && <StockAutomationDialog settings={settings} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'item' && (
        <StockItemDialog
          item={dialog.item}
          categories={categories}
          defaultCategoryId={dialog.categoryId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'stockOut' && <StockOutDialog item={dialog.item} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'zoho' && <ZohoBooksDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'category' && (
        <CategoryDialog
          category={dialog.category}
          itemCount={items.filter((i) => i.categoryId === dialog.category._id).length}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Category + rows ───────────────────────────

function CategorySection({
  category,
  allItems,
  items,
  drafts,
  onDraft,
  isLocked,
  onOpenZoho,
  onAddItem,
  onEditItem,
  onStockOut,
  onEditCategory,
}: {
  category: StockCategory;
  allItems: StockItem[];
  items: StockItem[];
  drafts: Drafts;
  onDraft: (key: string, value: string) => void;
  isLocked: (item: StockItem) => boolean;
  onOpenZoho: () => void;
  onAddItem: () => void;
  onEditItem: (item: StockItem) => void;
  onStockOut: (item: StockItem) => void;
  onEditCategory: () => void;
}) {
  const total = allItems.reduce((sum, i) => sum + draftTotal(i, drafts), 0);
  const removeItem = useRemoveStockItem();
  const listed = category.listStyle !== 'plain';

  return (
    <section
      id={`stock-cat-${category._id}`}
      className="scroll-mt-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5">
        <h2 className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[14px] font-semibold text-slate-950">{category.name}</span>
          <span className="shrink-0 text-[13px] tabular-nums text-slate-500">
            {total.toLocaleString('en-IN')} unit{total === 1 ? '' : 's'}
          </span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onAddItem}
            className="h-7 rounded-md px-2 text-[12px] font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            + Add item
          </button>
          <button
            onClick={onEditCategory}
            aria-label={`Edit category ${category.name}`}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <ul className="divide-y divide-slate-100">
        {items.map((item) => {
          // Numbering follows the full category, so filtering doesn't renumber lines.
          const position = allItems.indexOf(item);
          const split = item.oldQuantity != null;
          const qty = draftTotal(item, drafts);
          const changed = isChanged(item, drafts);
          const health = stockHealth(item, qty);
          const indent = listed ? 'sm:pl-7' : '';
          const locked = isLocked(item);
          return (
            <li key={item._id} className={clsx('relative px-4 py-3 transition-colors', changed && 'bg-amber-50/50')}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 pr-9 sm:pr-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {listed && (
                      <span className="w-5 shrink-0 text-right font-mono text-[12px] text-slate-400">
                        {listPrefix(category.listStyle, position)}
                      </span>
                    )}
                    <span className="text-[14px] font-medium text-slate-900">{item.name}</span>
                    {item.size && (
                      <span
                        title="Size"
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[12px] font-medium tabular-nums text-slate-700"
                      >
                        <RulerIcon />
                        {item.size}
                      </span>
                    )}
                    {item.note && <span className="text-[13px] text-slate-500">({item.note})</span>}
                    {health === 'out' && <Badge tone="red">Out of stock</Badge>}
                    {health === 'low' && <Badge tone="amber">Low - alert at {item.lowStockAt}</Badge>}
                  </p>
                  {(item.expiryDates.length > 0 || item.productCode || locked) && (
                    <p className={clsx('mt-1 flex flex-wrap items-center gap-1.5', indent)}>
                      {locked && (
                        <button
                          type="button"
                          onClick={onOpenZoho}
                          title={`Follows “${item.zohoItemName || item.name}” in Zoho Books - record purchases, sales and adjustments there`}
                          className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-inset ring-sky-200 transition hover:bg-sky-100"
                        >
                          <SyncIcon />
                          Synced from Zoho Books
                        </button>
                      )}
                      {item.expiryDates.map((d) => {
                        const state = expiryState(d);
                        return (
                          <Badge key={d} tone={state === 'expired' ? 'red' : state === 'soon' ? 'amber' : 'slate'}>
                            {state === 'expired' ? 'Expired' : 'Exp'} {formatExpiry(d)}
                          </Badge>
                        );
                      })}
                      {item.productCode &&
                        (locked ? (
                          <Badge tone="slate" title="Product code / Zoho SKU">
                            {item.productCode}
                          </Badge>
                        ) : (
                          <Badge tone="brand" title="Shipments booked with this product code deduct from this line automatically">
                            Auto-deducts · {item.productCode}
                          </Badge>
                        ))}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:justify-end">
                  {changed && (
                    <span className="text-[12px] tabular-nums text-slate-500">
                      was {item.quantity}
                      <span className={clsx('ml-1 font-semibold', qty >= item.quantity ? 'text-emerald-600' : 'text-red-600')}>
                        {qty > item.quantity ? '+' : ''}
                        {qty - item.quantity || '±0'}
                      </span>
                    </span>
                  )}
                  {locked ? (
                    <ReadOnlyQuantity item={item} />
                  ) : split ? (
                    <div className="flex items-center gap-2">
                      <QuantityStepper
                        label={`${displayName(item)} (old)`}
                        caption="Old"
                        value={drafts[`${item._id}:old`] ?? String(item.oldQuantity)}
                        onChange={(v) => onDraft(`${item._id}:old`, v)}
                      />
                      <span aria-hidden className="text-slate-300">+</span>
                      <QuantityStepper
                        label={`${displayName(item)} (new)`}
                        caption="New"
                        value={drafts[`${item._id}:new`] ?? String(item.quantity - (item.oldQuantity ?? 0))}
                        onChange={(v) => onDraft(`${item._id}:new`, v)}
                      />
                      <span className="min-w-[44px] text-[13px] tabular-nums text-slate-500">
                        = <span className="font-semibold text-slate-900">{qty}</span>
                      </span>
                    </div>
                  ) : (
                    <QuantityStepper
                      label={displayName(item)}
                      value={drafts[item._id] ?? String(item.quantity)}
                      onChange={(v) => onDraft(item._id, v)}
                    />
                  )}
                  {/* Pinned top-right on phones so it never wraps onto its own line. */}
                  <div className="absolute right-3 top-2.5 sm:static">
                  <Menu
                    label={`More actions for ${displayName(item)}`}
                    triggerClassName="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    trigger={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <circle cx="5" cy="12" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="19" cy="12" r="1.8" />
                      </svg>
                    }
                  >
                    {!locked && (
                      <MenuItem onSelect={() => onStockOut(item)} icon={<OutIcon />}>
                        Record stock out
                      </MenuItem>
                    )}
                    <MenuItem onSelect={() => onEditItem(item)} icon={<EditIcon />}>
                      Edit details
                    </MenuItem>
                    <MenuDivider />
                    <MenuItem
                      tone="danger"
                      onSelect={() => {
                        if (confirm(`Remove ${displayName(item)} from stock? Its history is kept.`)) removeItem.mutate(item._id);
                      }}
                    >
                      Remove item
                    </MenuItem>
                  </Menu>
                  </div>
                </div>
              </div>

              <div className={indent}>
                <InternalNote item={item} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The manager's own note under each product - reservations, who to chase, where it's
 * kept. Edited in place and saved on blur; never part of the WhatsApp update.
 */
function InternalNote({ item }: { item: StockItem }) {
  const save = useSaveInternalNote();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.internalNote);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setValue(item.internalNote);
  }, [item.internalNote, editing]);

  useEffect(() => {
    if (editing) {
      const el = ref.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = value.trim();
    if (next !== item.internalNote) save.mutate({ id: item._id, internalNote: next });
  }

  if (editing) {
    return (
      <div className="mt-2">
        <textarea
          ref={ref}
          rows={2}
          value={value}
          maxLength={1000}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setValue(item.internalNote);
              setEditing(false);
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit();
          }}
          aria-label={`Private note for ${displayName(item)}`}
          placeholder="Only you and the team see this - e.g. 7 blocked for Bengaluru training"
          className="w-full resize-y rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[13px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
        />
        <p className="mt-1 text-[11px] text-slate-400">Saves when you click away · Esc to cancel · not sent to WhatsApp</p>
      </div>
    );
  }

  if (item.internalNote) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group mt-2 flex w-full items-start gap-2 rounded-lg bg-amber-50/70 px-2.5 py-1.5 text-left text-[13px] text-amber-900 ring-1 ring-inset ring-amber-100 transition hover:bg-amber-50"
        title="Private note - click to edit"
      >
        <NoteIcon />
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{item.internalNote}</span>
        <span className="shrink-0 text-[11px] font-medium text-amber-700/0 transition group-hover:text-amber-700">Edit</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="mt-1.5 inline-flex items-center gap-1.5 rounded text-[12px] font-medium text-slate-400 transition hover:text-slate-700"
    >
      <NoteIcon />
      Add private note
    </button>
  );
}

/** A Zoho-linked line: the number is shown, not edited - it changes in Zoho Books. */
function ReadOnlyQuantity({ item }: { item: StockItem }) {
  return (
    <div
      className="flex h-8 items-center gap-2 rounded-lg bg-slate-50 px-3 ring-1 ring-inset ring-slate-200"
      aria-label={`${displayName(item)}: ${item.quantity} in stock, from Zoho Books`}
    >
      {item.oldQuantity != null && (
        <span className="text-[12px] tabular-nums text-slate-500">
          {item.oldQuantity} old + {item.quantity - item.oldQuantity} new =
        </span>
      )}
      <span className="min-w-[2ch] text-right text-[14px] font-semibold tabular-nums text-slate-900">{item.quantity}</span>
    </div>
  );
}

function QuantityStepper({
  label,
  caption,
  value,
  onChange,
}: {
  label: string;
  caption?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const n = toInt(value);

  // Enter jumps to the next count box, so a full shelf count is type-Enter-type-Enter.
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(String(n + 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(String(Math.max(0, n - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const all = [...document.querySelectorAll<HTMLInputElement>('input[data-stock-qty]')];
      const next = all[all.indexOf(e.currentTarget) + 1];
      next?.focus();
      next?.select();
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {caption && <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{caption}</span>}
      <div className="flex h-8 items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        <button
          type="button"
          onClick={() => onChange(String(Math.max(0, n - 1)))}
          disabled={n <= 0}
          aria-label={`One fewer ${label}`}
          className="flex w-7 items-center justify-center text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
        <input
          data-stock-qty
          type="text"
          inputMode="numeric"
          aria-label={`Quantity of ${label}`}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onFocus={(e) => e.target.select()}
          onKeyDown={onKeyDown}
          className="w-12 border-x border-slate-200 text-center text-[14px] font-semibold tabular-nums text-slate-900 outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(String(n + 1))}
          aria-label={`One more ${label}`}
          className="flex w-7 items-center justify-center text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CategoryDialog({
  category,
  itemCount,
  onClose,
}: {
  category: StockCategory;
  itemCount: number;
  onClose: () => void;
}) {
  const update = useUpdateStockCategory();
  const remove = useDeleteStockCategory();
  const [name, setName] = useState(category.name);
  const [listStyle, setListStyle] = useState<ListStyle>(category.listStyle);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await update.mutateAsync({ id: category._id, body: { name: name.trim(), listStyle } });
    onClose();
  }

  return (
    <Modal
      title="Edit category"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            disabled={itemCount > 0 || remove.isPending}
            title={itemCount > 0 ? 'Remove or move its items first' : undefined}
            onClick={async () => {
              if (!confirm(`Delete the ${category.name} category?`)) return;
              await remove.mutateAsync(category._id);
              onClose();
            }}
            className="mr-auto h-9 rounded-lg px-3 text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
          >
            Delete category
          </button>
          <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
            Cancel
          </button>
          <button type="submit" form="stock-category-form" disabled={update.isPending} className="btn-primary h-9 px-4 py-0 text-[13px]">
            Save
          </button>
        </>
      }
    >
      <form id="stock-category-form" onSubmit={submit} className="space-y-4">
        <FormField label="Name" htmlFor="category-name" hint="Used as the heading in the WhatsApp update.">
          <input id="category-name" required value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </FormField>
        <fieldset>
          <legend className="mb-1.5 block text-[13px] font-medium text-slate-700">Lines listed as</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(LIST_STYLE_LABELS) as ListStyle[]).map((s) => (
              <label
                key={s}
                className={clsx(
                  'cursor-pointer rounded-lg px-3 py-2 text-[13px] font-medium ring-1 ring-inset transition',
                  listStyle === s ? 'bg-brand-50 text-brand-900 ring-brand-300' : 'text-slate-600 ring-slate-200 hover:bg-slate-50'
                )}
              >
                <input
                  type="radio"
                  name="list-style"
                  value={s}
                  checked={listStyle === s}
                  onChange={() => setListStyle(s)}
                  className="sr-only"
                />
                {LIST_STYLE_LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

// ─────────────────────────── History ───────────────────────────

const REASON_LABELS: Record<StockMovement['reason'], string> = {
  count: 'Count',
  dispatch: 'Stock out',
  shipment: 'Shipment',
  created: 'Added',
  zoho: 'Zoho Books',
};

function RecentChanges() {
  const { data: movements = [], isLoading } = useStockMovements();

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-slate-950">Recent changes</h2>
        <span className="hidden text-[12px] text-slate-400 sm:inline">Counts, stock outs, shipments and Zoho Books, newest first</span>
      </div>
      {isLoading ? (
        <div className="h-32 animate-pulse bg-slate-50" />
      ) : movements.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-slate-500">No changes yet.</p>
      ) : (
        <ol className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
          {movements.map((m) => (
            <li key={m._id} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
              <span
                className={clsx(
                  'mt-0.5 w-[78px] shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold',
                  m.reason === 'zoho' && 'bg-sky-50 text-sky-800',
                  m.reason === 'shipment' && 'bg-brand-50 text-brand-800',
                  m.reason === 'dispatch' && 'bg-violet-50 text-violet-700',
                  m.reason === 'count' && 'bg-slate-100 text-slate-700',
                  m.reason === 'created' && 'bg-emerald-50 text-emerald-700'
                )}
              >
                {REASON_LABELS[m.reason]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-slate-800">
                  <span className="font-medium">{m.itemName}</span>{' '}
                  {m.reason === 'created' ? (
                    <span className="text-slate-500">added with {m.quantityAfter}</span>
                  ) : (
                    <>
                      <span className="tabular-nums text-slate-500">
                        {m.quantityAfter - m.change} → {m.quantityAfter}
                      </span>{' '}
                      <span className={clsx('font-semibold tabular-nums', m.change >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                        ({m.change > 0 ? '+' : ''}
                        {m.change})
                      </span>
                    </>
                  )}
                  {m.customer && (
                    <>
                      {' '}
                      <span className="text-slate-400">to</span> <span className="text-slate-700">{m.customer}</span>
                    </>
                  )}
                  {m.shipmentId && (
                    <>
                      {' '}
                      <span className="text-slate-400">·</span>{' '}
                      <Link to={`/shipments/${m.shipmentId}`} className="font-mono text-[12px] text-brand-700 hover:underline">
                        {m.trackingNumber}
                      </Link>
                    </>
                  )}
                </p>
                {m.note && <p className="mt-0.5 text-[12px] text-slate-500">{m.note}</p>}
              </div>
              <span className="shrink-0 text-right text-[12px] text-slate-400">
                {m.userName && <span className="hidden sm:inline">{m.userName} · </span>}
                {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ─────────────────────────── Bits ───────────────────────────

function Metric({
  label,
  value,
  detail,
  tone,
  selected = false,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  tone?: 'danger' | 'warn';
  selected?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        {tone && <span aria-hidden className={clsx('h-1.5 w-1.5 rounded-full', tone === 'danger' ? 'bg-red-500' : 'bg-amber-500')} />}
        {label}
      </span>
      <span
        className={clsx(
          'mt-2 block text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums',
          tone === 'danger' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-slate-950'
        )}
      >
        {value.toLocaleString('en-IN')}
      </span>
      <span className="mt-2 block text-[12px] leading-snug text-slate-500">{detail}</span>
    </>
  );
  const base = 'flex min-w-0 flex-col justify-start bg-white px-4 py-4 text-left sm:px-5';
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        base,
        'transition hover:bg-slate-50 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
        selected && 'shadow-[inset_0_-2px_0_theme(colors.brand.800)]'
      )}
    >
      {body}
    </button>
  );
}

function Badge({
  tone,
  title,
  children,
}: {
  tone: 'red' | 'amber' | 'slate' | 'brand';
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        tone === 'red' && 'bg-red-50 text-red-700 ring-red-200',
        tone === 'amber' && 'bg-amber-50 text-amber-800 ring-amber-200',
        tone === 'slate' && 'bg-slate-50 text-slate-600 ring-slate-200',
        tone === 'brand' && 'bg-brand-50 text-brand-800 ring-brand-200'
      )}
    >
      {children}
    </span>
  );
}

function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return format(new Date(2000, 0, 1, h, m), 'h:mm a');
}

function StockSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading stock">
      <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
      <div className="h-28 animate-pulse rounded-xl bg-white ring-1 ring-slate-200" />
      {[0, 1].map((i) => (
        <div key={i} className="h-56 animate-pulse rounded-xl bg-white ring-1 ring-slate-200" />
      ))}
    </div>
  );
}

const iconProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true } as const;

function PlusIcon() {
  return (
    <svg {...iconProps} strokeWidth={2.5}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg {...iconProps}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" strokeLinejoin="round" />
    </svg>
  );
}

function OutIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 7h13l5 5-5 5H3M13 12H3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RulerIcon() {
  return (
    <svg className="shrink-0 text-slate-400" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 17 17 3l4 4L7 21Z" strokeLinejoin="round" />
      <path d="m7 13 2 2M10 10l2 2M13 7l2 2" strokeLinecap="round" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg className="shrink-0" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 13a8 8 0 0 0 14.3 4.9L20 16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 3v5h5M20 21v-5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg className="mt-[3px] shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 4h16v12l-4 4H4Z" strokeLinejoin="round" />
      <path d="M16 20v-4h4M8 9h8M8 13h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
