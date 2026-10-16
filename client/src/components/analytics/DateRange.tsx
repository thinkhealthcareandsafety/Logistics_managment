import { useState } from 'react';
import { SegmentedControl } from '../SegmentedControl';

const RANGE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

type RangeKey = '7' | '30' | '90' | 'all' | 'custom';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The date range picked on an analytics-style page, as from/to (YYYY-MM-DD, or undefined). */
export function useDateRange() {
  const [range, setRange] = useState<RangeKey>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const from = range === 'custom' ? customFrom : range === 'all' ? '' : isoDaysAgo(Number(range));
  const to = range === 'custom' ? customTo : '';
  return { range, setRange, customFrom, setCustomFrom, customTo, setCustomTo, from: from || undefined, to: to || undefined };
}

export function DateRangeControl({ state }: { state: ReturnType<typeof useDateRange> }) {
  const { range, setRange, customFrom, setCustomFrom, customTo, setCustomTo } = state;
  return (
    <div className="flex max-w-full flex-col items-stretch gap-2 sm:items-end">
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <SegmentedControl<RangeKey>
          label="Date range"
          value={range}
          onChange={setRange}
          segments={[
            ...RANGE_PRESETS.map((p) => ({ value: String(p.days) as RangeKey, label: p.label })),
            { value: 'all', label: 'All time' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      </div>
      {range === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
          <label className="flex items-center gap-2">
            <span>From</span>
            <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="input h-8 w-auto py-0 text-[13px]" />
          </label>
          <label className="flex items-center gap-2">
            <span>to</span>
            <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="input h-8 w-auto py-0 text-[13px]" />
          </label>
        </div>
      )}
    </div>
  );
}
