/** Shared helpers for building TwinRun records. */
import type { Verdict } from '../workspace/validation.ts';
import type { RunCheck, RunPoint } from './types.ts';

const RANK: Record<Verdict, number> = { pass: 0, review: 1, fail: 2 };

export function overall(checks: RunCheck[]) {
  const counts: Record<Verdict, number> = { pass: 0, review: 0, fail: 0 };
  let verdict: Verdict = 'pass';
  for (const c of checks) {
    counts[c.status]++;
    if (RANK[c.status] > RANK[verdict]) verdict = c.status;
  }
  return { verdict, counts };
}

/** First time a series reaches `level` (inclusive), interpolated between samples, or null. */
export function firstCrossing(points: RunPoint[], level: number): number | null {
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.v < level) continue;
    const q = points[i - 1];
    if (!q || p.v === q.v) return p.t;
    return q.t + ((level - q.v) / (p.v - q.v)) * (p.t - q.t);
  }
  return null;
}

export function peak(points: RunPoint[]): RunPoint {
  let best = points[0] ?? { t: 0, v: 0 };
  for (const p of points) if (p.v > best.v) best = p;
  return best;
}

/** Keeps at most `max` points, always including the first, last and peak samples. */
export function downsample(points: RunPoint[], max = 900): RunPoint[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: RunPoint[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  const pk = peak(points);
  if (!out.includes(pk)) out.push(pk);
  out.push(points[points.length - 1]);
  return [...new Set(out)].sort((a, b) => a.t - b.t);
}

/**
 * A "max"-type check: value must stay below `fail`; at or above `review`
 * (but below fail) it needs review. Margin is against the fail limit.
 */
export function maxCheck(
  base: Omit<RunCheck, 'status' | 'margin' | 'firstAtS' | 'limit'>,
  points: RunPoint[] | null,
  review: number,
  fail: number,
  failStatus: Verdict = 'fail',
): RunCheck {
  const status: Verdict = base.value >= fail ? failStatus : base.value >= review ? 'review' : 'pass';
  const firstAtS = points ? firstCrossing(points, status === 'pass' ? fail : status === 'review' ? review : fail) : null;
  return {
    ...base,
    limit: fail,
    status,
    margin: (fail - base.value) / Math.max(Math.abs(fail), 1e-9),
    firstAtS: status === 'pass' ? null : firstAtS,
  };
}

export const fmtS = (t: number | null) => (t === null ? '—' : `${t.toFixed(1)} s`);

export const newRunId = () => `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
