/** A compact SVG chart for engineering series.
 *
 * Written rather than pulled in so the axes always carry real units and the
 * reference lines (a self-cleaning floor, a supply voltage, a constraint limit)
 * can be drawn with their own labels — a constraint limit drawn without a label
 * is just a line. */

import { useMemo } from 'react';

export interface Series {
  label: string;
  colour: string;
  points: Array<[number, number]>;
  dashed?: boolean;
}

export interface ReferenceLine {
  value: number;
  label: string;
  colour?: string;
  axis?: 'y' | 'x';
}

interface Props {
  series: Series[];
  xLabel?: string;
  yLabel?: string;
  xUnit?: string;
  yUnit?: string;
  references?: ReferenceLine[];
  height?: number;
  /** Force the y axis to start at zero, for magnitudes where that matters. */
  zeroBased?: boolean;
}

const PAD = { top: 12, right: 16, bottom: 30, left: 54 };

export function Chart({
  series,
  xUnit = '',
  yUnit = '',
  references = [],
  height = 210,
  zeroBased = false,
}: Props) {
  const width = 560;

  const bounds = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of series) {
      for (const [x, y] of s.points) {
        if (Number.isFinite(x)) xs.push(x);
        if (Number.isFinite(y)) ys.push(y);
      }
    }
    for (const r of references) {
      if (r.axis === 'x') xs.push(r.value);
      else ys.push(r.value);
    }
    if (!xs.length || !ys.length) return null;

    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    if (zeroBased) minY = Math.min(0, minY);
    if (minY === maxY) {
      minY -= Math.abs(minY) * 0.1 || 1;
      maxY += Math.abs(maxY) * 0.1 || 1;
    } else {
      const pad = (maxY - minY) * 0.08;
      minY -= pad;
      maxY += pad;
    }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY, maxY };
  }, [series, references, zeroBased]);

  if (!bounds) {
    return (
      <div className="small faint" style={{ padding: 24, textAlign: 'center' }}>
        No data for this chart.
      </div>
    );
  }

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const sx = (x: number) =>
    PAD.left + ((x - bounds.minX) / (bounds.maxX - bounds.minX || 1)) * plotW;
  const sy = (y: number) =>
    PAD.top + plotH - ((y - bounds.minY) / (bounds.maxY - bounds.minY || 1)) * plotH;

  const yTicks = 4;
  const xTicks = 4;

  const fmtTick = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1000) return v.toFixed(0);
    if (a >= 10) return v.toFixed(0);
    if (a >= 1) return v.toFixed(1);
    if (a === 0) return '0';
    return v.toPrecision(2);
  };

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
        {/* Grid and y axis */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const value = bounds.minY + ((bounds.maxY - bounds.minY) * i) / yTicks;
          const y = sy(value);
          return (
            <g key={`y${i}`}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y}
                y2={y}
                stroke="#1e2a3b"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 7}
                y={y + 3.5}
                textAnchor="end"
                fontSize={9.5}
                fill="#64748b"
                fontFamily="ui-monospace, monospace"
              >
                {fmtTick(value)}
                {yUnit}
              </text>
            </g>
          );
        })}

        {/* x axis ticks */}
        {Array.from({ length: xTicks + 1 }, (_, i) => {
          const value = bounds.minX + ((bounds.maxX - bounds.minX) * i) / xTicks;
          const x = sx(value);
          return (
            <text
              key={`x${i}`}
              x={x}
              y={height - 10}
              textAnchor="middle"
              fontSize={9.5}
              fill="#64748b"
              fontFamily="ui-monospace, monospace"
            >
              {fmtTick(value)}
              {xUnit}
            </text>
          );
        })}

        {/* Reference lines, always labelled */}
        {references.map((ref) => {
          const colour = ref.colour ?? '#34d399';
          if (ref.axis === 'x') {
            const x = sx(ref.value);
            return (
              <g key={ref.label}>
                <line
                  x1={x}
                  x2={x}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke={colour}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <text x={x + 4} y={PAD.top + 10} fontSize={9} fill={colour}>
                  {ref.label}
                </text>
              </g>
            );
          }
          const y = sy(ref.value);
          return (
            <g key={ref.label}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y}
                y2={y}
                stroke={colour}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <text x={width - PAD.right - 3} y={y - 4} textAnchor="end" fontSize={9} fill={colour}>
                {ref.label}
              </text>
            </g>
          );
        })}

        {/* Series */}
        {series.map((s) => {
          if (s.points.length === 0) return null;
          const d = s.points
            .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${sx(x).toFixed(2)} ${sy(y).toFixed(2)}`)
            .join(' ');
          return (
            <g key={s.label}>
              <path
                d={d}
                fill="none"
                stroke={s.colour}
                strokeWidth={1.8}
                strokeDasharray={s.dashed ? '4 3' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.length <= 24 &&
                s.points.map(([x, y], i) => (
                  <circle key={i} cx={sx(x)} cy={sy(y)} r={2.2} fill={s.colour} />
                ))}
            </g>
          );
        })}
      </svg>

      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label}>
            <span
              className="legend-swatch"
              style={{ background: s.colour, borderRadius: 1 }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
