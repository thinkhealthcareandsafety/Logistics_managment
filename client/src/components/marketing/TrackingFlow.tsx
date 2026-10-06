import clsx from 'clsx';

/**
 * System diagram: what the product actually does. Every courier in (1,600+ through
 * TrackingMore), through the tracking hub, out to the three places a status update
 * needs to land.
 *
 * Geometry lives in a 1000x420 space. The SVG (lines only) and the HTML chips share it
 * because the wrapper is locked to the same aspect ratio, so chips can be positioned in
 * percentages and still meet the path endpoints while their labels stay real text.
 */

const VIEW_W = 1000;
const VIEW_H = 420;
const MID_Y = VIEW_H / 2;

// Hub box edges - lines terminate here rather than at the hub's centre.
const HUB = { left: 388, right: 612 };

const SOURCE = { x: 148, y: MID_Y };

const OUTPUTS = [
  { label: 'Ops dashboard', hint: 'Triage queue', x: 852, y: 80 },
  { label: 'WhatsApp & email', hint: 'Checkpoint alerts', x: 852, y: MID_Y },
  { label: 'Customer link', hint: 'No-login tracking', x: 852, y: 340 },
];

/** Rounded L-route between two points. Falls back to a straight line when level. */
function elbow(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y2 - y1) < 1) return `M ${x1} ${y1} H ${x2}`;

  const dirX = x2 > x1 ? 1 : -1;
  const dirY = y2 > y1 ? 1 : -1;
  const midX = (x1 + x2) / 2;
  const r = Math.min(24, Math.abs(y2 - y1) / 2, Math.abs(midX - x1));

  return [
    `M ${x1} ${y1}`,
    `H ${midX - r * dirX}`,
    `Q ${midX} ${y1} ${midX} ${y1 + r * dirY}`,
    `V ${y2 - r * dirY}`,
    `Q ${midX} ${y2} ${midX + r * dirX} ${y2}`,
    `H ${x2}`,
  ].join(' ');
}

/**
 * Which part of the system a "How it works" step is about:
 * 0 = the couriers feeding in, 1 = the hub doing the work, 2 = the people it reaches.
 */
export type FlowStage = 0 | 1 | 2;

/**
 * Spotlight the active stage and recede the rest; no-op when nothing is selected.
 * Receding is opacity on the node itself, which sits on an opaque slate-50 backing
 * matching the panel - otherwise the connector lines would show through a faded node.
 */
function stageClass(stage: FlowStage, active: FlowStage | undefined) {
  if (active === undefined) return '';
  return active === stage
    ? 'scale-[1.06] ring-2 ring-brand-400 ring-offset-2 ring-offset-slate-50'
    : 'opacity-35';
}

export function TrackingFlow({ active }: { active?: FlowStage }) {
  const inputLine =
    active === undefined || active < 2 ? 'flow-line stroke-brand-500' : 'stroke-brand-300/50';
  const outputLine =
    active === 2 ? 'flow-line stroke-brand-500' : active === undefined ? 'stroke-brand-400/70' : 'stroke-brand-300/50';

  return (
    <div aria-hidden className="pointer-events-none select-none">
      {/* Full diagram - needs the width to stay legible */}
      <div className="relative mx-auto hidden aspect-[1000/420] w-full max-w-4xl md:block">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="absolute inset-0 h-full w-full">
          <path
            d={elbow(SOURCE.x, SOURCE.y, HUB.left, MID_Y)}
            fill="none"
            strokeWidth={2}
            className={clsx('transition-colors duration-500', inputLine)}
          />
          {OUTPUTS.map((out) => (
            <path
              key={out.label}
              d={elbow(HUB.right, MID_Y, out.x, out.y)}
              fill="none"
              strokeWidth={active === 2 ? 2 : 1.5}
              className={clsx('transition-colors duration-500', outputLine)}
            />
          ))}
        </svg>

        <Chip
          x={SOURCE.x}
          y={SOURCE.y}
          tone="source"
          label="1,600+ couriers"
          hint="Shree Maruti, Delhivery, Blue Dart…"
          className={stageClass(0, active)}
        />

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-slate-50">
          <div
            className={clsx(
              'flex w-[224px] flex-col items-center gap-1 rounded-2xl bg-brand-900 px-5 py-4 text-center shadow-lift transition duration-500',
              stageClass(1, active)
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-300">ThinkHealth</span>
            <span className="text-lg font-semibold text-white">Tracking hub</span>
            <span className="text-[11px] leading-snug text-brand-200">
              Normalised status · checkpoints · alerts
            </span>
          </div>
        </div>

        {OUTPUTS.map((out) => (
          <Chip key={out.label} x={out.x} y={out.y} label={out.label} hint={out.hint} className={stageClass(2, active)} />
        ))}
      </div>

      {/* Compact fallback - the routing collapses below tablet width */}
      <div className="mx-auto flex max-w-xs flex-col items-center gap-2 md:hidden">
        <Card tone="source" label="1,600+ couriers" hint="Shree Maruti, Delhivery, Blue Dart…" />
        <Arrow />
        <div className="w-full rounded-2xl bg-brand-900 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-white">ThinkHealth tracking hub</p>
          <p className="mt-0.5 text-[11px] text-brand-200">Normalised status · checkpoints · alerts</p>
        </div>
        <Arrow />
        {OUTPUTS.map((out) => (
          <Card key={out.label} label={out.label} hint={out.hint} />
        ))}
      </div>
    </div>
  );
}

function Chip({
  x,
  y,
  label,
  hint,
  tone,
  className,
}: {
  x: number;
  y: number;
  label: string;
  hint: string;
  tone?: 'source';
  className?: string;
}) {
  return (
    // Opaque backing matching the panel, so a faded chip recedes instead of going see-through.
    <span
      style={{ left: `${(x / VIEW_W) * 100}%`, top: `${(y / VIEW_H) * 100}%` }}
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-xl bg-slate-50"
    >
    <span
      className={clsx(
        'block whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-center shadow-card transition duration-500',
        tone === 'source' ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white',
        className
      )}
    >
      <span className={`block text-xs font-semibold ${tone === 'source' ? 'text-brand-900' : 'text-slate-800'}`}>
        {label}
      </span>
      <span className="mt-0.5 block text-[10px] text-slate-500">{hint}</span>
    </span>
    </span>
  );
}

function Card({ label, hint, tone }: { label: string; hint: string; tone?: 'source' }) {
  return (
    <div
      className={`w-full rounded-xl border px-4 py-2.5 text-center ${
        tone === 'source' ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p className={`text-sm font-semibold ${tone === 'source' ? 'text-brand-900' : 'text-slate-800'}`}>{label}</p>
      <p className="text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

function Arrow() {
  return <span className="text-lg leading-none text-brand-400">↓</span>;
}
