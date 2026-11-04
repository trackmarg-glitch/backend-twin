import { navigate } from '../app/routes';
import { useStoreVersion } from '../core/useStoreVersion';
import { VerdictTag, fmtDateTime } from '../pages/shared';
import { Badge, Panel } from '../ui/primitives';
import { VERDICT_LABEL } from '../workspace/validation';
import { fmtS } from './common';
import { RunChart } from './RunChart';
import { twinRuns } from './TwinRunStore';
import type { RunAdvice, TwinRun } from './types';
import './twinRuns.css';

const COMPONENT_LABEL = { 'brake-caliper': 'Brake Caliper', 'alloy-wheel': 'Alloy Wheel' } as const;

/**
 * Full analysis of one finished Digital Twin run: every recorded quantity from
 * start to end with its limits, the moments it went critical, the component's
 * condition afterwards, what failing those limits means, and what to change.
 */
export function TwinRunAnalysisPage({ runId }: { runId: string }) {
  useStoreVersion(twinRuns);
  const run = twinRuns.get(runId);

  if (!run) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Run analysis</h1>
            <div className="page-sub">This run isn’t stored in this browser any more.</div>
          </div>
        </div>
        <RunList current={null} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Run analysis</h1>
          <div className="page-sub">
            {COMPONENT_LABEL[run.component]} twin · {run.title} · {run.durationS.toFixed(1)} s · {fmtDateTime(run.createdAt)}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => navigate({ section: 'ai-insights', runId: run.id })}>
            AI verdict for this run
          </button>
          <button className="btn" onClick={() => navigate({ section: 'digital-twin', module: run.component })}>
            Back to the twin
          </button>
          <button className="btn" onClick={() => navigate({ section: 'analytics' })}>
            Design analytics
          </button>
        </div>
      </div>

      <VerdictBanner run={run} />

      <div className="run-grid">
        <Panel title="Is the component OK after this run?" right={<Badge kind="estimated" />}>
          <ul className="run-cond">
            {run.condition.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          <ChecksTable run={run} />
        </Panel>
        <Panel title="Critical timeline">
          <ul className="run-events">
            {run.events.map((e, i) => (
              <li key={i} className={e.severity}>
                <span className="t">{e.t.toFixed(1)} s</span>
                <span className="sev">{e.severity === 'fail' ? 'CRITICAL' : e.severity === 'review' ? 'REVIEW' : 'INFO'}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Run summary">
        <div className="run-summary">
          {run.summary.map((s) => (
            <div key={s.label}>
              <span className="l">{s.label}</span>
              <span className="v">{s.value}</span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="section-label">Full run, start to end</div>
      <div className="run-charts">
        {run.series.map((s) => (
          <Panel key={s.key} bodyClass="panel-body run-chart-body">
            <RunChart series={s} events={run.events} />
          </Panel>
        ))}
      </div>

      <FailureEffects run={run} />
      <AdvicePanel advice={run.advice} component={run.component} />

      <Panel title="Test conditions">
        <div className="run-summary">
          {run.conditions.map((s) => (
            <div key={s.label}>
              <span className="l">{s.label}</span>
              <span className="v">{s.value}</span>
            </div>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          {run.modelNote}
        </div>
      </Panel>

      <RunList current={run.id} />
    </div>
  );
}

export function VerdictBanner({ run }: { run: TwinRun }) {
  return (
    <div className={`run-banner ${run.verdict}`}>
      <VerdictTag verdict={run.verdict} size="lg" />
      <div>
        <div className="run-banner-head">{run.condition.headline}</div>
        <div className="muted">
          {run.counts.pass} checks OK · {run.counts.review} need review · {run.counts.fail} critical
        </div>
      </div>
    </div>
  );
}

export function ChecksTable({ run }: { run: TwinRun }) {
  return (
    <div className="table-scroll">
      <table className="data-table plain">
        <thead>
          <tr>
            <th>Check</th>
            <th>Limit</th>
            <th className="r">This run</th>
            <th>Status</th>
            <th className="r">Margin</th>
            <th className="r">First crossed</th>
          </tr>
        </thead>
        <tbody>
          {run.checks.map((c) => (
            <tr key={c.id}>
              <td>{c.label}</td>
              <td className="muted">{c.requirement}</td>
              <td className="r">
                {c.value.toFixed(c.digits)} {c.unit === '–' ? '' : c.unit}
              </td>
              <td>
                <VerdictTag verdict={c.status} />
              </td>
              <td className={`r margin ${c.status}`}>
                {c.margin < 0 ? `${Math.abs(c.margin * 100).toFixed(1)} % over` : `${(c.margin * 100).toFixed(1)} % margin`}
              </td>
              <td className="r">{fmtS(c.firstAtS)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FailureEffects({ run }: { run: TwinRun }) {
  const open = run.checks.filter((c) => c.status !== 'pass');
  return (
    <Panel title="What happens past these limits">
      {open.length === 0 ? (
        <div className="hint">Nothing reached a limit in this run. For reference, here is what each limit protects against:</div>
      ) : null}
      <ul className="run-after">
        {(open.length ? open : run.checks).map((c) => (
          <li key={c.id} className={c.status}>
            <b>
              {c.label}
              {c.status !== 'pass' && ` · ${VERDICT_LABEL[c.status]}${c.firstAtS !== null ? ` from ${fmtS(c.firstAtS)}` : ''}`}
            </b>
            <span>{c.after}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function AdvicePanel({ advice, component }: { advice: RunAdvice[]; component: TwinRun['component'] }) {
  return (
    <Panel title="What to change">
      <ul className="run-advice">
        {advice.map((a, i) => (
          <li key={i}>
            <span>{a.text}</span>
            {a.goTo && (
              <button
                className="btn sm"
                onClick={() => navigate(a.goTo === 'design-lab' ? { section: 'design-lab' } : { section: 'digital-twin', module: component })}
              >
                {a.goTo === 'design-lab' ? 'Design Lab' : 'Twin'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function RunList({ current }: { current: string | null }) {
  const runs = twinRuns.runs;
  return (
    <Panel title="Recent twin runs">
      {runs.length === 0 ? (
        <div className="hint">No finished twin runs yet. Run the brake caliper or alloy wheel twin to the end of its duration.</div>
      ) : (
        <ul className="run-list">
          {runs.map((r) => (
            <li key={r.id} className={r.id === current ? 'current' : ''}>
              <VerdictTag verdict={r.verdict} />
              <button className="link-btn" onClick={() => navigate({ section: 'analytics', runId: r.id })}>
                {COMPONENT_LABEL[r.component]} · {r.title}
              </button>
              <span className="muted">{fmtDateTime(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
