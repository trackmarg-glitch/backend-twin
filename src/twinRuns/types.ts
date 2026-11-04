/**
 * A finished Digital Twin run, analysed: the full time series from start to
 * end, the checks the run is judged on (with the moment each limit was first
 * crossed), the events that mattered, and the condition of the component
 * afterwards. Plain JSON, so it can be stored and shown on any page.
 *
 * Everything comes from the twin's simplified model and the workspace's
 * reduced-order estimates, checked against demo limits. It describes what this
 * model says happened in this run; it is not a test or FEA result.
 */
import type { Verdict } from '../workspace/validation.ts';

export type TwinRunComponent = 'brake-caliper' | 'alloy-wheel';

export interface RunPoint {
  t: number;
  v: number;
}

export interface RunSeries {
  key: string;
  label: string;
  unit: string;
  digits: number;
  points: RunPoint[];
  /** Values at or above this need review (drawn as an amber line). */
  review?: number;
  reviewLabel?: string;
  /** Values at or above this are critical (drawn as a red line, the span above is shaded). */
  fail?: number;
  failLabel?: string;
}

export interface RunCheck {
  id: string;
  label: string;
  requirement: string;
  value: number;
  limit: number;
  unit: string;
  digits: number;
  status: Verdict;
  /** Signed margin as a fraction of the limit; negative = exceeded. */
  margin: number;
  /** Run time when the limit (or the review threshold) was first crossed, s. */
  firstAtS: number | null;
  basis: 'model' | 'estimated';
  why: string;
  /** What happens to the real component once this limit is passed. */
  after: string;
}

export interface RunEvent {
  t: number;
  severity: 'info' | 'review' | 'fail';
  text: string;
}

export interface RunAdvice {
  text: string;
  /** Where to make the change, if somewhere in the app. */
  goTo?: 'design-lab' | 'digital-twin';
}

export interface TwinRun {
  id: string;
  createdAt: number;
  component: TwinRunComponent;
  title: string;
  scenario: string;
  durationS: number;
  conditions: { label: string; value: string }[];
  summary: { label: string; value: string }[];
  series: RunSeries[];
  checks: RunCheck[];
  events: RunEvent[];
  verdict: Verdict;
  counts: Record<Verdict, number>;
  condition: { headline: string; lines: string[] };
  advice: RunAdvice[];
  modelNote: string;
}
