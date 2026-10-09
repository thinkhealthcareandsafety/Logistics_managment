import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { downloadCsv } from '../utils/csv';

/**
 * "Download CSV" for a table: builds the file in the browser from the rows already on
 * screen (no server round-trip) and saves it as `<name>-<date>.csv`.
 */
export function DownloadCsvButton({
  name,
  headers,
  rows,
  label = 'Download CSV',
}: {
  /** File name stem, e.g. "orders-by-weekday". The date is appended. */
  name: string;
  headers: string[];
  rows: unknown[][];
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={rows.length === 0}
      onClick={() => {
        const file = `${name}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        downloadCsv(file, headers, rows);
        toast.success(`Downloaded ${file}`);
      }}
      title={rows.length === 0 ? 'Nothing to download in this range' : 'Save this table as a CSV file (opens in Excel)'}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
