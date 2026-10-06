import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { useBulkArchiveShipments, useRefreshAllShipments, useShipments } from '../hooks/useShipments';
import { ShipmentCard } from '../components/ShipmentCard';
import { ShipmentTable } from '../components/ShipmentTable';
import { ShipmentSkeletonGrid, ShipmentSkeletonRows } from '../components/ShipmentSkeleton';
import { AddShipmentDialog } from '../components/AddShipmentDialog';
import { BulkImportDialog } from '../components/BulkImportDialog';
import { CameraIcon } from '../components/LabelScanner';
import { SegmentedControl } from '../components/SegmentedControl';
import { ShipmentsWhatsAppDialog } from '../components/ShipmentsWhatsAppDialog';
import { WhatsAppIcon } from '../components/stock/ShareStockDialog';
import { ALL_STATUSES, STATUS_LABELS, STATUS_STYLES } from '../utils/status';
import { getUrgency, needsAttention } from '../utils/urgency';
import { exportShipmentsCsv } from '../utils/csv';
import type { Shipment, ShipmentStatus } from '../types/shipment';

type Scope = 'active' | 'archived';
type StatusFilter = 'all' | ShipmentStatus;
type Sort = 'eta' | 'updated' | 'added';
type View = 'list' | 'grid';

const SORT_LABELS: Record<Sort, string> = {
  eta: 'Soonest ETA',
  updated: 'Recently updated',
  added: 'Newest first',
};

const VIEW_STORAGE_KEY = 'th.dashboard.view';

const toolbarButton =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

export function Dashboard() {
  const [view, setView] = useState<View>(readStoredView);
  // Three independent filters rather than one flat list of tabs: which shelf you're
  // looking at (active/archived), which leg of the journey, and "only the problems".
  // Mixing them in one row made "Needs attention" look like a sixth status.
  const [scope, setScope] = useState<Scope>('active');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [courier, setCourier] = useState('all');
  const [sort, setSort] = useState<Sort>('eta');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  // "Scan label" opens the file picker straight away; the chosen photo opens the Add dialog.
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // A table has no business on a phone; below sm the cards are the only view.
  const wide = useMediaQuery('(min-width: 640px)');
  const effectiveView: View = wide ? view : 'grid';

  // Volume here is a few shipments/week, so both sets are fetched once and
  // filtered/sorted in memory - filtering feels instant and the tab counts stay
  // truthful, which a server round-trip per keystroke wouldn't give us.
  const { data: activeShipments, isLoading } = useShipments({ archived: false });
  const { data: archivedShipments } = useShipments({ archived: true });
  const refreshAll = useRefreshAllShipments();
  const bulkArchive = useBulkArchiveShipments();

  const archived = scope === 'archived';

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const typingInField = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      if (e.key === '/' && !typingInField) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        if (document.activeElement === searchRef.current) searchRef.current?.blur();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Selection is scoped to what you can see - carrying hidden rows into a bulk
  // archive after switching filters is how things get archived by accident.
  useEffect(() => setSelectedIds(new Set()), [scope, status, attentionOnly, courier]);

  function changeScope(next: Scope) {
    setScope(next);
    setStatus('all');
    // Attention is an active-shipments concept; nothing archived is "late".
    if (next === 'archived') setAttentionOnly(false);
  }

  function toggleAttention() {
    setScope('active');
    setAttentionOnly((on) => !on);
  }

  function changeView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode) - the choice just won't persist.
    }
  }

  const active = useMemo(() => activeShipments || [], [activeShipments]);
  const archive = useMemo(() => archivedShipments || [], [archivedShipments]);
  const shelf = archived ? archive : active;
  const attention = useMemo(() => active.filter(needsAttention), [active]);

  // Couriers on this shelf, busiest first - the filter only appears with 2+.
  const couriersOnShelf = useMemo(() => {
    const m = new Map<string, { code: string; name: string; count: number }>();
    for (const s of shelf) {
      const row = m.get(s.carrierCode) || { code: s.carrierCode, name: s.carrierName || s.carrierCode, count: 0 };
      row.count += 1;
      m.set(s.carrierCode, row);
    }
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [shelf]);
  const courierActive = courier !== 'all' && couriersOnShelf.some((c) => c.code === courier);
  const all = useMemo(
    () => (courierActive ? shelf.filter((s) => s.carrierCode === courier) : shelf),
    [shelf, courier, courierActive]
  );
  const attentionInView = useMemo(() => all.filter(needsAttention), [all]);
  const activeCouriers = useMemo(() => new Set(active.map((s) => s.carrierCode)).size, [active]);

  // Stage counts are faceted: they respect the shelf, the courier and the attention
  // filter, so each number is exactly how many rows that segment will show.
  const counts = useMemo(() => {
    const base = attentionOnly && !archived ? attentionInView : all;
    const byStatus = {} as Record<ShipmentStatus, number>;
    for (const s of ALL_STATUSES) byStatus[s] = 0;
    for (const s of base) byStatus[s.status] += 1;
    return { all: base.length, active: active.length, attention: attention.length, archived: archive.length, ...byStatus };
  }, [all, archived, attentionOnly, active, attention, attentionInView, archive]);

  const summary = useMemo(() => {
    let inFlight = 0;
    let units = 0;
    let dueToday = 0;
    let dueTomorrow = 0;
    let onRoad = 0;
    let awaitingPickup = 0;
    for (const s of active) {
      if (s.status === 'delivered') continue;
      inFlight += 1;
      if (s.status === 'in_transit' || s.status === 'out_for_delivery') onRoad += 1;
      if (s.status === 'pending') awaitingPickup += 1;
      units += s.productDetails?.quantity || 0;
      const urgency = getUrgency(s);
      if (urgency === 'today') dueToday += 1;
      if (urgency === 'tomorrow') dueTomorrow += 1;
    }
    const held = attention.filter((s) => s.status === 'exception').length;
    return { inFlight, units, dueToday, dueTomorrow, onRoad, awaitingPickup, held, late: attention.length - held };
  }, [active, attention]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = all;

    if (attentionOnly && !archived) list = list.filter(needsAttention);
    if (status !== 'all') list = list.filter((s) => s.status === status);

    if (query) {
      list = list.filter((s) =>
        [
          s.trackingNumber,
          s.carrierName,
          s.productDetails?.name,
          s.customerInfo?.name,
          s.currentLocation,
          s.deliveryAddress?.line,
          s.deliveryAddress?.city,
          s.deliveryAddress?.state,
          s.deliveryAddress?.pincode,
          s.carrierRoute?.destinationCity,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(query))
      );
    }

    return [...list].sort((a, b) => {
      if (sort === 'eta') return etaRank(a) - etaRank(b);
      if (sort === 'updated') return timeOf(b.lastCheckedAt) - timeOf(a.lastCheckedAt);
      return timeOf(b.createdAt) - timeOf(a.createdAt);
    });
  }, [all, archived, attentionOnly, status, search, sort]);

  // Spelled out in the WhatsApp message so the reader knows it's a filtered view.
  const viewScope = [
    archived && 'Archived',
    courierActive && couriersOnShelf.find((c) => c.code === courier)?.name,
    attentionOnly && !archived && 'Needs attention',
    status !== 'all' && STATUS_LABELS[status],
    search.trim() && `matching “${search.trim()}”`,
  ]
    .filter(Boolean)
    .join(' · ');

  const lastSynced = useMemo(() => {
    const times = active.map((s) => timeOf(s.lastCheckedAt)).filter(Boolean);
    return times.length ? new Date(Math.max(...times)) : null;
  }, [active]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      visible.every((s) => prev.has(s._id)) ? new Set() : new Set(visible.map((s) => s._id))
    );
  }

  async function archiveSelected() {
    await bulkArchive.mutateAsync({ ids: [...selectedIds], isArchived: !archived });
    setSelectedIds(new Set());
  }

  return (
    <div className="space-y-6">
      {/* ───────── Page header ───────── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-slate-950">Shipments</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
            <span>
              {activeCouriers === 0
                ? 'Any courier on TrackingMore'
                : activeCouriers === 1
                  ? (active[0]?.carrierName ?? '1 courier')
                  : `${activeCouriers} couriers`}
            </span>
            <span aria-hidden className="text-slate-300">/</span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={clsx(
                  'h-1.5 w-1.5 rounded-full',
                  refreshAll.isPending ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'
                )}
              />
              {refreshAll.isPending
                ? 'Syncing with couriers…'
                : lastSynced
                  ? `Synced ${formatDistanceToNow(lastSynced, { addSuffix: true })}`
                  : 'Not synced yet'}
            </span>
            {!refreshAll.isPending && active.length > 0 && (
              <button
                onClick={() => refreshAll.mutate()}
                className="rounded font-medium text-brand-700 underline-offset-2 transition hover:text-brand-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
              >
                Sync now
              </button>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary inline-flex items-center gap-2" onClick={() => setShowBulkImport(true)}>
            <UploadIcon />
            Import CSV
          </button>
          <button
            className="btn-secondary inline-flex items-center gap-2"
            onClick={() => labelInputRef.current?.click()}
            title="Add a shipment from a photo of its label"
          >
            <CameraIcon className="h-4 w-4" />
            Scan label
          </button>
          <input
            ref={labelInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setLabelFile(file);
              setShowAddDialog(true);
            }}
          />
          <button className="btn-primary inline-flex items-center gap-2" onClick={() => setShowAddDialog(true)}>
            <PlusIcon />
            Add shipment
          </button>
        </div>
      </header>

      {/* ───────── Summary ───────── */}
      <section
        aria-label="Summary"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:grid-cols-4"
      >
        <Metric
          label="In flight"
          value={summary.inFlight}
          detail={`${summary.onRoad} on the road · ${summary.awaitingPickup} awaiting pickup`}
        />
        <Metric
          label="Needs attention"
          value={counts.attention}
          tone={counts.attention > 0 ? 'danger' : undefined}
          detail={
            counts.attention === 0
              ? 'Everything is on schedule'
              : [summary.late && `${summary.late} late`, summary.held && `${summary.held} held up`]
                  .filter(Boolean)
                  .join(' · ')
          }
          selected={attentionOnly && !archived}
          onClick={counts.attention > 0 || attentionOnly ? toggleAttention : undefined}
        />
        <Metric
          label="Due in 48 hours"
          value={summary.dueToday + summary.dueTomorrow}
          detail={
            summary.dueToday
              ? `${summary.dueToday} due today`
              : summary.dueTomorrow
                ? 'None due today'
                : 'Nothing due soon'
          }
        />
        <Metric
          label="Units in flight"
          value={summary.units}
          detail={`Across ${summary.inFlight} consignment${summary.inFlight === 1 ? '' : 's'}`}
        />
      </section>

      {/* ───────── Shipments panel ───────── */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {/* Panel header: what you're looking at, then how it splits by stage. */}
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 pb-3 pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-3 lg:justify-start">
            <h2 className="text-[15px] font-semibold text-slate-950">
              {archived ? 'Archived shipments' : 'Active shipments'}
            </h2>
            <ScopeSwitch
              scope={scope}
              activeCount={counts.active}
              archivedCount={counts.archived}
              onChange={changeScope}
            />
          </div>

          {/* A segmented control, not tabs: the stages are one question ("which stage?")
              with one answer, and the dots tie each option to its badge in the rows below.
              Every stage stays put even at zero, so the control never reflows. */}
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
            <SegmentedControl<StatusFilter>
              label="Filter by stage"
              value={status}
              onChange={setStatus}
              segments={[
                { value: 'all', label: 'All', count: counts.all },
                ...ALL_STATUSES.map((s) => ({
                  value: s,
                  label: STATUS_LABELS[s],
                  count: counts[s],
                  dot: STATUS_STYLES[s].dot,
                })),
              ]}
            />
          </div>
        </div>

        {/* Toolbar - swaps to bulk actions in place while rows are selected, so the
            table never jumps under the pointer. */}
        <div className="flex min-h-[56px] flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2.5">
          {selectedIds.size > 0 ? (
            <>
              <span className="mr-1 inline-flex h-8 items-center rounded-lg bg-brand-900 px-2.5 text-[13px] font-medium tabular-nums text-white">
                {selectedIds.size} selected
              </span>
              <button onClick={archiveSelected} disabled={bulkArchive.isPending} className={toolbarButton}>
                <ArchiveIcon />
                {archived ? 'Restore' : 'Archive'}
              </button>
              <button
                onClick={() => exportShipmentsCsv(all.filter((s) => selectedIds.has(s._id)))}
                className={toolbarButton}
              >
                <DownloadIcon />
                Export
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto h-8 rounded-lg px-2.5 text-[13px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                Clear
                <kbd className="ml-2 hidden rounded border border-slate-200 px-1 font-mono text-[10px] text-slate-400 sm:inline">
                  Esc
                </kbd>
              </button>
            </>
          ) : (
            <>
              <div className="relative w-full sm:w-72">
                <SearchIcon />
                <input
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search AWB, customer, city, pincode…"
                  aria-label="Search shipments"
                  className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-[13px] text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 [&::-webkit-search-cancel-button]:hidden"
                />
                {search ? (
                  <button
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                    </svg>
                  </button>
                ) : (
                  <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 px-1 font-mono text-[10px] leading-4 text-slate-400 sm:block">
                    /
                  </kbd>
                )}
              </div>

              {/* The applied "problems only" filter, shown where filters live and removable
                  in one click - the summary tile that set it is off to the side. */}
              {attentionOnly && !archived && (
                <button
                  onClick={() => setAttentionOnly(false)}
                  aria-label="Remove filter: needs attention"
                  className="group inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-50 pl-2.5 pr-1.5 text-[13px] font-medium text-red-700 ring-1 ring-inset ring-red-200 transition hover:bg-red-100"
                >
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  Needs attention
                  <span className="flex h-5 w-5 items-center justify-center rounded text-red-400 transition group-hover:text-red-700">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
              )}

              <div className="flex flex-1 items-center justify-end gap-2">
                {/* Only worth a control once there's more than one courier to tell apart. */}
                {(couriersOnShelf.length > 1 || courierActive) && (
                  <label className="relative">
                    <span className="sr-only">Filter by courier</span>
                    <select
                      value={courierActive ? courier : 'all'}
                      onChange={(e) => setCourier(e.target.value)}
                      className={clsx(
                        toolbarButton,
                        'max-w-[200px] cursor-pointer appearance-none truncate pr-7',
                        courierActive && 'border-brand-300 bg-brand-50 text-brand-900'
                      )}
                    >
                      <option value="all">All couriers ({shelf.length})</option>
                      {couriersOnShelf.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.count})
                        </option>
                      ))}
                    </select>
                    <svg
                      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden
                    >
                      <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </label>
                )}
                <label className="relative">
                  <span className="sr-only">Sort shipments</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as Sort)}
                    className={clsx(toolbarButton, 'cursor-pointer appearance-none pr-7')}
                  >
                    {Object.entries(SORT_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden
                  >
                    <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </label>

                <button
                  onClick={() => exportShipmentsCsv(visible)}
                  disabled={visible.length === 0}
                  className={toolbarButton}
                >
                  <DownloadIcon />
                  <span className="hidden sm:inline">Export</span>
                </button>

                <button
                  onClick={() => setShowWhatsApp(true)}
                  disabled={visible.length === 0}
                  className={toolbarButton}
                  title="A ready-to-send WhatsApp message for the shipments in this view"
                >
                  <WhatsAppIcon size={14} />
                  <span className="hidden sm:inline">WhatsApp</span>
                  <span className="sr-only sm:hidden">WhatsApp message</span>
                </button>

                <div
                  role="group"
                  aria-label="Layout"
                  className="hidden h-8 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 sm:flex"
                >
                  <ViewButton label="Table" active={view === 'list'} onClick={() => changeView('list')}>
                    <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
                  </ViewButton>
                  <ViewButton label="Cards" active={view === 'grid'} onClick={() => changeView('grid')}>
                    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
                    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
                    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
                    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
                  </ViewButton>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Body */}
        {isLoading ? (
          effectiveView === 'list' ? (
            <ShipmentSkeletonRows />
          ) : (
            <div className="bg-slate-50/60 p-4">
              <ShipmentSkeletonGrid count={3} />
            </div>
          )
        ) : visible.length === 0 ? (
          <EmptyState
            hasAnyShipments={all.length > 0}
            archived={archived}
            onClear={() => {
              setStatus('all');
              setAttentionOnly(false);
              setSearch('');
            }}
            onAdd={() => setShowAddDialog(true)}
          />
        ) : effectiveView === 'list' ? (
          <ShipmentTable
            shipments={visible}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 bg-slate-50/60 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((s) => (
              <ShipmentCard key={s._id} shipment={s} selected={selectedIds.has(s._id)} onToggleSelect={toggleSelect} />
            ))}
          </div>
        )}

        {/* Footer */}
        {!isLoading && visible.length > 0 && (
          <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-2.5 text-[12px] text-slate-500">
            <span className="tabular-nums">
              {visible.length === all.length
                ? `${all.length} shipment${all.length === 1 ? '' : 's'}`
                : `Showing ${visible.length} of ${all.length}`}
            </span>
            <span>Sorted by {sort === 'eta' ? 'soonest ETA' : SORT_LABELS[sort].toLowerCase()}</span>
          </div>
        )}
      </section>

      {showAddDialog && (
        <AddShipmentDialog
          initialLabel={labelFile}
          onClose={() => {
            setShowAddDialog(false);
            setLabelFile(null);
          }}
        />
      )}
      {showBulkImport && <BulkImportDialog onClose={() => setShowBulkImport(false)} />}
      {showWhatsApp && (
        <ShipmentsWhatsAppDialog shipments={visible} scope={viewScope} onClose={() => setShowWhatsApp(false)} />
      )}
    </div>
  );
}

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
  tone?: 'danger';
  selected?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        {tone === 'danger' && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-500" />}
        {label}
        {onClick && (
          <svg
            className="ml-auto text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden
          >
            <path d="M5 12h14m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span
        className={clsx(
          'mt-2 block text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums',
          tone === 'danger' ? 'text-red-600' : 'text-slate-950'
        )}
      >
        {value.toLocaleString('en-IN')}
      </span>
      <span className="mt-2 block text-[12px] leading-snug text-slate-500">{detail}</span>
    </>
  );

  // Flex column, top-aligned: a <button> otherwise centres its content vertically and
  // drifts out of line with the plain tiles beside it when a row's heights differ.
  const base = 'flex min-w-0 flex-col justify-start bg-white px-4 py-4 text-left sm:px-5';
  if (!onClick) return <div className={base}>{body}</div>;

  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        base,
        'group relative transition hover:bg-slate-50 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
        selected && 'bg-red-50/40 shadow-[inset_0_-2px_0_theme(colors.red.500)] hover:bg-red-50/60'
      )}
    >
      {body}
    </button>
  );
}

function ScopeSwitch({
  scope,
  activeCount,
  archivedCount,
  onChange,
}: {
  scope: Scope;
  activeCount: number;
  archivedCount: number;
  onChange: (scope: Scope) => void;
}) {
  const toArchive = scope === 'active';
  // Nothing to switch to - don't offer an empty shelf.
  if (toArchive && archivedCount === 0) return null;

  return (
    <button
      onClick={() => onChange(toArchive ? 'archived' : 'active')}
      aria-label={
        toArchive ? `View archived shipments (${archivedCount})` : `Back to active shipments (${activeCount})`
      }
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
    >
      {toArchive ? (
        <>
          <ArchiveIcon />
          Archived
          <span className="tabular-nums text-slate-400">{archivedCount}</span>
        </>
      ) : (
        <>
          <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M19 12H5m6-6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to active
          <span className="tabular-nums text-slate-400">{activeCount}</span>
        </>
      )}
    </button>
  );
}

function ViewButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} view`}
      title={`${label} view`}
      className={clsx(
        'flex h-full w-8 items-center justify-center rounded-md transition',
        active ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.1)]' : 'text-slate-400 hover:text-slate-700'
      )}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function EmptyState({
  hasAnyShipments,
  archived,
  onClear,
  onAdd,
}: {
  hasAnyShipments: boolean;
  archived: boolean;
  onClear: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" strokeLinejoin="round" />
          <path d="m3 8 9 5 9-5M12 13v8" strokeLinejoin="round" />
        </svg>
      </span>
      {hasAnyShipments ? (
        <>
          <p className="mt-4 text-sm font-semibold text-slate-900">No shipments match this view</p>
          <p className="mt-1 text-[13px] text-slate-500">Try another tab or clear your search.</p>
          <button onClick={onClear} className="btn-secondary mt-5">
            Clear filters
          </button>
        </>
      ) : archived ? (
        <>
          <p className="mt-4 text-sm font-semibold text-slate-900">Nothing archived yet</p>
          <p className="mt-1 text-[13px] text-slate-500">Archived shipments are kept here, out of the main view.</p>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm font-semibold text-slate-900">No shipments yet</p>
          <p className="mt-1 text-[13px] text-slate-500">Add an AWB from any courier, or import a batch from CSV.</p>
          <button onClick={onAdd} className="btn-primary mt-5">
            Add your first shipment
          </button>
        </>
      )}
    </div>
  );
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function readStoredView(): View {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

function timeOf(value?: string): number {
  return value ? new Date(value).getTime() : 0;
}

// Shipments without an ETA sort last rather than pretending to be due at epoch.
function etaRank(shipment: Shipment): number {
  return shipment.estimatedDelivery ? new Date(shipment.estimatedDelivery).getTime() : Number.MAX_SAFE_INTEGER;
}

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 15V3m0 0-4 4m4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12m0 0-4-4m4 4 4-4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" strokeLinecap="round" />
    </svg>
  );
}
