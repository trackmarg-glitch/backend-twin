import { useEffect, useRef, useState } from 'react';
import { navigate } from '../app/routes';
import { useStoreVersion } from '../core/useStoreVersion';
import { VerdictTag } from '../pages/shared';
import { twinRuns } from './TwinRunStore';
import type { TwinRun, TwinRunComponent } from './types';
import { fmtS } from './common';
import './twinRuns.css';

const AUTO_OPEN_S = 10;

/** Records a twin run the moment its sim reports `finished`. Call on every render of the twin page. */
export function useRunCapture(finished: boolean, build: () => Omit<TwinRun, 'id' | 'createdAt'>) {
  const prev = useRef(finished);
  useEffect(() => {
    if (finished && !prev.current) twinRuns.add(build());
    prev.current = finished;
  });
}

/**
 * The card a twin page shows when a run finishes: the verdict, what went wrong
 * and when, and the way into the full analysis and the AI verdict. Analytics
 * opens by itself after a short countdown unless the user stays.
 */
export function RunCompletePanel({ component }: { component: TwinRunComponent }) {
  useStoreVersion(twinRuns);
  const run = twinRuns.get(twinRuns.fresh);
  const [left, setLeft] = useState(AUTO_OPEN_S);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    setLeft(AUTO_OPEN_S);
    setAuto(true);
  }, [run?.id]);

  useEffect(() => {
    if (!run || run.component !== component || !auto) return;
    if (left <= 0) {
      twinRuns.dismiss();
      navigate({ section: 'analytics', runId: run.id });
      return;
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [run, component, auto, left]);

  if (!run || run.component !== component) return null;
  const open = run.checks.filter((c) => c.status !== 'pass');
  const go = (section: 'analytics' | 'ai-insights') => {
    twinRuns.dismiss();
    navigate({ section, runId: run.id });
  };

  return (
    <div className={`run-done ${run.verdict}`} role="dialog" aria-label="Twin run complete">
      <div className="run-done-head">
        <span className="run-done-kicker">Run complete · AI verdict</span>
        <button className="run-done-x" aria-label="Close" onClick={() => twinRuns.dismiss()}>
          ×
        </button>
      </div>
      <div className="run-done-verdict">
        <VerdictTag verdict={run.verdict} size="lg" />
        <span className="run-done-title">{run.title}</span>
      </div>
      <div className="run-done-headline">{run.condition.headline}</div>
      {open.length > 0 && (
        <ul className="run-done-issues">
          {open.slice(0, 3).map((c) => (
            <li key={c.id} className={c.status}>
              <b>{c.label}</b>: {c.value.toFixed(c.digits)} {c.unit === '–' ? '' : c.unit} ({c.requirement})
              {c.firstAtS !== null && <span className="muted"> · first at {fmtS(c.firstAtS)}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="run-done-actions">
        <button className="btn primary" onClick={() => go('analytics')}>
          Open full analysis{auto ? ` (${left}s)` : ''}
        </button>
        <button className="btn" onClick={() => go('ai-insights')}>
          More detail in AI Verdict
        </button>
        {auto && (
          <button className="btn sm" onClick={() => setAuto(false)}>
            Stay here
          </button>
        )}
      </div>
      <div className="hint">Estimated from the twin’s simplified model and demo limits. Not a test result.</div>
    </div>
  );
}
