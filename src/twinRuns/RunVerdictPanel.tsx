import { navigate } from '../app/routes';
import { useStoreVersion } from '../core/useStoreVersion';
import { fmtDateTime } from '../pages/shared';
import { Badge, Panel } from '../ui/primitives';
import { VERDICT_LABEL } from '../workspace/validation';
import { fmtS } from './common';
import { AdvicePanel, ChecksTable, VerdictBanner } from './TwinRunAnalysisPage';
import { twinRuns } from './TwinRunStore';
import type { TwinRun } from './types';
import './twinRuns.css';

/** The AI verdict for one twin run, as written out in plain language. Deterministic, from the run's checks. */
export function runVerdictText(run: TwinRun): string[] {
  const out: string[] = [run.condition.headline];
  const fails = run.checks.filter((c) => c.status === 'fail');
  const reviews = run.checks.filter((c) => c.status === 'review');
  for (const c of fails) {
    out.push(
      `${c.label} reached ${c.value.toFixed(c.digits)} ${c.unit === '–' ? '' : c.unit} against ${c.requirement}${c.firstAtS !== null ? `, first at ${fmtS(c.firstAtS)} into the run` : ''}. ${c.why} ${c.after}`,
    );
  }
  for (const c of reviews) {
    out.push(`${c.label} needs review: ${c.value.toFixed(c.digits)} ${c.unit === '–' ? '' : c.unit} (${c.requirement}). ${c.why}`);
  }
  if (!fails.length && !reviews.length) out.push('Every check stayed inside its limit with margin; the component is OK for this duty under this model.');
  const critical = run.events.find((e) => e.severity === 'fail');
  if (critical) out.push(`The critical moment was at ${critical.t.toFixed(1)} s: ${critical.text}`);
  return out;
}

/** Shown at the top of AI Insights when it is opened for a twin run. */
export function RunVerdictPanel({ runId }: { runId: string }) {
  useStoreVersion(twinRuns);
  const run = twinRuns.get(runId);
  if (!run) {
    return (
      <Panel title="AI verdict for a twin run">
        <div className="hint">That run isn’t stored in this browser any more. Run the twin again to get a fresh verdict.</div>
      </Panel>
    );
  }
  const text = runVerdictText(run);
  return (
    <Panel
      className="run-verdict"
      title={`AI verdict · twin run · ${run.title}`}
      right={
        <div className="panel-actions">
          <Badge kind="estimated" />
          <span className="chip">{fmtDateTime(run.createdAt)}</span>
        </div>
      }
    >
      <VerdictBanner run={run} />
      <div className="run-verdict-body">
        <div>
          {text.map((p, i) => (
            <p key={i} className={i === 0 ? 'ai-headline' : 'ai-p'}>
              {p}
            </p>
          ))}
          <div className="run-verdict-actions">
            <button className="btn primary" onClick={() => navigate({ section: 'analytics', runId: run.id })}>
              Full graphs of this run
            </button>
            <button className="btn" onClick={() => navigate({ section: 'digital-twin', module: run.component })}>
              Run the twin again
            </button>
            <button
              className="btn"
              onClick={(e) => e.currentTarget.closest('.run-verdict')?.nextElementSibling?.scrollIntoView({ behavior: 'smooth' })}
            >
              Design verdict (A vs B) ↓
            </button>
          </div>
        </div>
        <div>
          <div className="sub-title">Checks for this run</div>
          <ChecksTable run={run} />
        </div>
      </div>
      <AdvicePanel advice={run.advice} component={run.component} />
      <div className="hint" style={{ marginTop: 8 }}>
        Verdict status: {VERDICT_LABEL[run.verdict]}. {run.modelNote}
      </div>
    </Panel>
  );
}
