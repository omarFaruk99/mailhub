"use client";

import * as React from "react";

// A small dependency-free multi-line chart.
// Rules it follows (house data-viz style):
//  - 2px lines, ≥8px end markers with a 2px surface ring, hairline solid grid.
//  - Series colours come from the fixed --series-N tokens (light/dark aware).
//  - Text never wears the series colour — a coloured dot beside ink text carries
//    identity, so the legend stays readable in both modes.
//  - Hover crosshair + tooltip is on by default.

export type Series = {
  key: string;
  label: string;
  /** CSS colour, normally `var(--series-N)`. */
  color: string;
  values: number[];
};

const PAD = { top: 12, right: 16, bottom: 24, left: 40 };
const HEIGHT = 240;

// Round the axis top up to a clean number (1 / 2 / 5 × 10ⁿ) so ticks read well.
// Kept even so the midpoint tick is a whole number too (6 → 0/3/6, never 2.5).
function niceMax(max: number) {
  if (max <= 0) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  const top = step * pow;
  return top % 2 === 0 ? top : top + 1;
}

export function LineChart({
  labels,
  series,
  formatLabel = (s) => s,
  emptyMessage = "No data yet.",
}: {
  /** One x label per point (ISO date strings). */
  labels: string[];
  series: Series[];
  formatLabel?: (label: string) => string;
  emptyMessage?: string;
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(720);
  const [hover, setHover] = React.useState<number | null>(null);

  // Redraw at the container's real width — the chart is fluid, the strokes are not.
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = labels.length;
  const hasData = series.some((s) => s.values.some((v) => v > 0));

  const innerW = Math.max(width - PAD.left - PAD.right, 10);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const top = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));

  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;

  const ticks = [0, top / 2, top];

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* Legend — always present for 2+ series; the period total doubles as a
          direct label, so identity never rests on colour alone. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-[13px]">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium tabular-nums">
              {s.values.reduce((a, b) => a + b, 0).toLocaleString()}
            </span>
          </span>
        ))}
      </div>

      <svg
        width={width}
        height={HEIGHT}
        className="block touch-none select-none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - box.left;
          const i = Math.round(((px - PAD.left) / innerW) * (n - 1));
          setHover(Math.min(Math.max(i, 0), n - 1));
        }}
      >
        {/* Grid + y ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(t) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {Math.round(t).toLocaleString()}
            </text>
          </g>
        ))}

        {/* X labels — first, middle, last only (never one per point) */}
        {[0, Math.floor((n - 1) / 2), n - 1]
          .filter((i, idx, arr) => i >= 0 && arr.indexOf(i) === idx)
          .map((i) => (
            <text
              key={i}
              x={x(i)}
              y={HEIGHT - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              className="fill-muted-foreground text-[11px]"
            >
              {formatLabel(labels[i])}
            </text>
          ))}

        {hasData && (
          <>
            {/* Crosshair */}
            {hover !== null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke="var(--border)"
                strokeWidth={1}
              />
            )}

            {series.map((s) => {
              const d = s.values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
              const last = s.values.length - 1;
              return (
                <g key={s.key}>
                  <path
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* End marker: 8px dot with a 2px surface ring */}
                  <circle
                    cx={x(last)}
                    cy={y(s.values[last])}
                    r={4}
                    fill={s.color}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                  {hover !== null && (
                    <circle
                      cx={x(hover)}
                      cy={y(s.values[hover])}
                      r={4}
                      fill={s.color}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  )}
                </g>
              );
            })}
          </>
        )}
      </svg>

      {!hasData && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      )}

      {/* Tooltip */}
      {hasData && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-40 rounded-lg border bg-popover p-2.5 text-[12px] shadow-md"
          style={{
            left: Math.min(Math.max(x(hover) - 80, 0), Math.max(width - 176, 0)),
            top: PAD.top + 28,
          }}
        >
          <div className="mb-1.5 font-medium">{formatLabel(labels[hover])}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 py-0.5">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-medium tabular-nums">{s.values[hover]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
