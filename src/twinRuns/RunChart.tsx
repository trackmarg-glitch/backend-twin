import { useEffect, useRef, useState } from 'react';
import type { RunEvent, RunSeries } from './types';

/**
 * One quantity over the whole run (start to end) as an SVG line. Amber line =
 * review threshold, red line = critical limit; the time spent above each is
 * shaded, and the moments the run first crossed them are marked.
 */
const PAD = { l: 48, r: 12, t: 12, b: 26 };

function nice(range: number, n: number) {
  const raw = Math.max(range, 1e-9) / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** Contiguous time spans where the series is at or above `level`. */
function spans(points: { t: number; v: number }[], level: number) {
  const out: [number, number][] = [];
  let start: number | null = null;
  for (const p of points) {
    if (p.v >= level && start === null) start = p.t;
    if (p.v < level && start !== null) {
      out.push([start, p.t]);
      start = null;
    }
  }
  if (start !== null) out.push([start, points[points.length - 1].t]);
  return out;
}

export function RunChart({ series, events = [], height = 200 }: { series: RunSeries; events?: RunEvent[]; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(520);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, e.contentRect.width)));
    ro.observe(wrap.current!);
    return () => ro.disconnect();
  }, []);

  const pts = series.points;
  if (pts.length < 2) {
    return (
      <div className="run-chart" ref={wrap}>
        <div className="run-chart-title">{series.label}</div>
        <div className="hint">Not enough samples.</div>
      </div>
    );
  }
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t || 1;
  let hi = Math.max(...pts.map((p) => p.v), series.fail ?? -Infinity, series.review ?? -Infinity);
  let lo = Math.min(0, ...pts.map((p) => p.v));
  if (hi - lo < 1e-9) hi = lo + 1;
  const step = nice(hi - lo, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil((hi * 1.04) / step) * step;
  const pw = w - PAD.l - PAD.r;
  const ph = height - PAD.t - PAD.b;
  const sx = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * pw;
  const sy = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * ph;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.t).toFixed(1)},${sy(p.v).toFixed(1)}`).join('');
  const yTicks: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) yTicks.push(v);
  const xStep = nice(t1 - t0, Math.max(3, Math.floor(pw / 80)));
  const xTicks: number[] = [];
  for (let v = Math.ceil(t0 / xStep) * xStep; v <= t1 + 1e-9; v += xStep) xTicks.push(v);
  const marks = events.filter((e) => e.severity !== 'info');
  const hp = hover !== null ? pts[hover] : null;
  const fmt = (v: number) => v.toFixed(series.digits);
  const status = (v: number) => (series.fail !== undefined && v >= series.fail ? 'fail' : series.review !== undefined && v >= series.review ? 'review' : 'ok');

  return (
    <div className="run-chart" ref={wrap}>
      <div className="run-chart-head">
        <span className="run-chart-title">{series.label}</span>
        <span className="run-chart-legend">
          {series.review !== undefined && (
            <span>
              <i className="lr" />
              {series.reviewLabel ?? 'review'} {fmt(series.review)} {series.unit}
            </span>
          )}
          {series.fail !== undefined && (
            <span>
              <i className="lf" />
              {series.failLabel ?? 'critical'} {fmt(series.fail)} {series.unit}
            </span>
          )}
        </span>
      </div>
      <svg width={w} height={height} role="img" aria-label={`${series.label} over the run`}>
        {series.review !== undefined && spans(pts, series.review).map(([a, b], i) => <rect key={`r${i}`} x={sx(a)} width={Math.max(1, sx(b) - sx(a))} y={PAD.t} height={ph} className="rc-span-review" />)}
        {series.fail !== undefined && spans(pts, series.fail).map(([a, b], i) => <rect key={`f${i}`} x={sx(a)} width={Math.max(1, sx(b) - sx(a))} y={PAD.t} height={ph} className="rc-span-fail" />)}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={w - PAD.r} y1={sy(v)} y2={sy(v)} className="rc-grid" />
            <text x={PAD.l - 6} y={sy(v) + 3.5} textAnchor="end" className="rc-tick">
              {Math.abs(v) >= 10000 ? `${+(v / 1000).toFixed(1)}k` : +v.toFixed(3)}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={v} x={sx(v)} y={height - 8} textAnchor="middle" className="rc-tick">
            {+v.toFixed(1)}s
          </text>
        ))}
        {series.review !== undefined && series.review <= hi && <line x1={PAD.l} x2={w - PAD.r} y1={sy(series.review)} y2={sy(series.review)} className="rc-line-review" />}
        {series.fail !== undefined && series.fail <= hi && <line x1={PAD.l} x2={w - PAD.r} y1={sy(series.fail)} y2={sy(series.fail)} className="rc-line-fail" />}
        {marks.map((e, i) => (
          <line key={`m${i}`} x1={sx(e.t)} x2={sx(e.t)} y1={PAD.t} y2={PAD.t + ph} className={`rc-mark ${e.severity}`} />
        ))}
        <path d={d} fill="none" className="rc-path" />
        {hp && (
          <g pointerEvents="none">
            <line x1={sx(hp.t)} x2={sx(hp.t)} y1={PAD.t} y2={PAD.t + ph} className="rc-cross" />
            <circle cx={sx(hp.t)} cy={sy(hp.v)} r={4.5} className={`rc-dot ${status(hp.v)}`} />
          </g>
        )}
        <rect
          x={PAD.l}
          y={PAD.t}
          width={pw}
          height={ph}
          fill="transparent"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
            let best = 0;
            for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].t - t) < Math.abs(pts[best].t - t)) best = i;
            setHover(best);
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hp && (
        <div className="tooltip rc-tip" style={{ left: Math.min(Math.max(sx(hp.t), 70), w - 70), top: PAD.t + 18 }}>
          <div className="tt-t">t = {hp.t.toFixed(2)} s</div>
          <div className="tt-v">
            {fmt(hp.v)} {series.unit} · {status(hp.v) === 'fail' ? 'CRITICAL' : status(hp.v) === 'review' ? 'NEEDS REVIEW' : 'OK'}
          </div>
        </div>
      )}
    </div>
  );
}
