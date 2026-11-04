/** Simulation Results — the engineering workspace.
 *
 * The viewport takes roughly two thirds of the width because the geometry and
 * its computed field are the thing being judged. The panel beside it carries
 * the numbers, each tagged with what produced it.
 *
 * When a candidate produced no result, this page says so plainly rather than
 * rendering an empty shape that looks like a successful analysis. */

import { useEffect, useMemo } from 'react';
import { PageHead } from '../components/Shell';
import {
  Empty,
  Metric,
  Note,
  Panel,
  Seg,
  Source,
  StatusChip,
  fmt,
} from '../components/primitives';
import { ResultViewport } from '../viewer/ResultViewport';
import { Chart, type Series } from '../components/Chart';
import { api } from '../services/api';
import { useStore } from '../store/useStore';

interface MetricColumn {
  key: string;
  label: string;
  /** Default true; a factor of safety is better when larger. */
  lowerIsBetter?: boolean;
}

const STRUCT: MetricColumn[] = [
  { key: 'max_von_mises_pa', label: 'Max von Mises stress' },
  { key: 'max_displacement_m', label: 'Max displacement' },
  { key: 'mass_kg', label: 'Mass' },
  { key: 'min_factor_of_safety', label: 'Factor of safety', lowerIsBetter: false },
];

const THERM: MetricColumn[] = [
  { key: 'max_temperature_k', label: 'Peak temperature' },
  { key: 'min_temperature_k', label: 'Minimum temperature' },
  { key: 'heat_flow_w', label: 'Heat flow' },
  { key: 'max_temperature_gradient_k_per_m', label: 'Peak gradient' },
];

export function Results() {
  const store = useStore();
  const study = store.study;
  const candidate = store.selectedCandidate();
  const baseline = store.baselineCandidate();

  // Load the stored field for whichever candidate is selected.
  useEffect(() => {
    if (!candidate?.fields_url) {
      store.setVisualization(null);
      return;
    }
    let cancelled = false;
    api
      .visualization(candidate.candidate_id)
      .then((p) => !cancelled && store.setVisualization(p))
      .catch(() => !cancelled && store.setVisualization(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.candidate_id, candidate?.fields_url]);

  const thermal = study?.analysis_type === 'steady_state_thermal';
  const metrics = thermal ? THERM : STRUCT;

  const trend = useMemo<Series[]>(() => {
    if (!study) return [];
    const key = thermal ? 'max_temperature_k' : 'max_von_mises_pa';
    const scale = thermal ? 1 : 1e-6;
    const points = study.candidates
      .filter((c) => c.evaluated && typeof c.metrics[key] === 'number')
      .map((c) => [c.index, c.metrics[key] * scale] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    return points.length
      ? [{ label: thermal ? 'Peak temperature (K)' : 'Peak stress (MPa)', colour: '#22d3ee', points }]
      : [];
  }, [study, thermal]);

  const limits = useMemo(() => {
    const out: Array<{ value: number; label: string; colour?: string }> = [];
    for (const c of candidate?.constraint_results ?? []) {
      if (c.metric === 'max_von_mises_pa' && c.limit) {
        out.push({ value: c.limit.value, label: 'allowable', colour: '#f4625f' });
      }
      if (c.metric === 'max_temperature_k') {
        if (c.lower) out.push({ value: c.lower.canonical_value, label: 'self-cleaning min', colour: '#2dd4a7' });
        if (c.upper) out.push({ value: c.upper.canonical_value, label: 'pre-ignition max', colour: '#f4625f' });
      }
    }
    return out;
  }, [candidate]);

  if (!study) {
    return (
      <>
        <PageHead title="Simulation Results" />
        <div className="main-body">
          <Panel>
            <Empty icon="◈">
              No simulation has run yet.
              <br />
              Build a design in <strong>New Design</strong> and generate candidates — results
              appear here, traceable to the solver that produced them.
            </Empty>
          </Panel>
        </div>
      </>
    );
  }

  const solved = study.candidates.filter((c) => c.evaluated);

  return (
    <>
      <PageHead
        title="Simulation Results"
        context={
          <>
            {study.optimization_run_id} · {study.solver_name} · mesh {study.mesh_preset} ·{' '}
            seed {study.random_seed}
          </>
        }
        actions={
          solved.length > 0 && (
            <Seg
              value={store.selectedCandidateId ?? ''}
              onChange={(v) => store.selectCandidate(v)}
              options={solved.slice(0, 7).map((c) => ({
                value: c.candidate_id,
                label: c.is_baseline ? 'Original' : `#${c.index}`,
              }))}
            />
          )
        }
      />

      <div className="main-body">
        <div className="work">
          {/* ---------------------------------------------- 3D viewport */}
          <div className="col">
            <ResultViewport height={560} />

            {trend.length > 0 && (
              <Panel title="Across all candidates" badge={<Source kind="solver" />}>
                <Chart
                  series={trend}
                  xUnit=""
                  references={thermal ? limits : limits.map((l) => ({ ...l }))}
                  height={190}
                />
                <div className="xs faint" style={{ marginTop: 6 }}>
                  One point per solver-evaluated candidate. Designs that failed carry no
                  metrics and do not appear.
                </div>
              </Panel>
            )}
          </div>

          {/* ------------------------------------------- results panel */}
          <div className="col">
            {!candidate ? (
              <Panel>
                <Empty>Select a candidate.</Empty>
              </Panel>
            ) : !candidate.evaluated ? (
              <Panel title="Simulation not completed" badge={<span className="chip chip-red">failed</span>}>
                <Note tone="red">
                  <strong>
                    {candidate.is_baseline ? 'The original design' : `Candidate ${candidate.index}`} produced
                    no result
                  </strong>
                  <div style={{ marginTop: 5 }}>
                    It failed at the <strong>{candidate.failure_stage}</strong> stage.
                  </div>
                  <div className="mono xs" style={{ marginTop: 7 }}>{candidate.failure_reason}</div>
                </Note>
                <div className="sm faint" style={{ marginTop: 12 }}>
                  There are no stress, displacement, temperature or mass values for this
                  design because nothing was computed for it. It is excluded from ranking.
                </div>
              </Panel>
            ) : (
              <>
                <Panel
                  title={candidate.is_baseline ? 'Original design' : `Candidate ${candidate.index}`}
                  badge={<StatusChip status={candidate.status} feasible={candidate.is_feasible} />}
                >
                  <div className="metrics">
                    {metrics.map((m) => {
                      const value = candidate.display_metrics[m.key];
                      const a = baseline?.metrics?.[m.key];
                      const b = candidate.metrics?.[m.key];
                      const delta =
                        !candidate.is_baseline && a && b && a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null;
                      return (
                        <Metric
                          key={m.key}
                          label={m.label}
                          value={value ? fmt(value.value) : '—'}
                          unit={value?.unit}
                          delta={delta}
                          lowerIsBetter={m.lowerIsBetter !== false}
                          source="solver"
                        />
                      );
                    })}
                  </div>
                </Panel>

                <Panel title="Constraint validation">
                  {candidate.constraint_results.length === 0 ? (
                    <div className="sm faint">No constraints configured.</div>
                  ) : (
                    candidate.constraint_results.map((c) => (
                      <div
                        key={c.constraint_id}
                        className="row-sb"
                        style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}
                      >
                        <span className="grow">
                          <div className="sm">{c.label ?? c.constraint_id}</div>
                          <div className="mono xs faint" style={{ marginTop: 2 }}>
                            {c.description}
                            {c.value && ` → ${fmt(c.value.value)} ${c.value.unit}`}
                          </div>
                        </span>
                        <span
                          className={`chip ${
                            c.passed === null ? 'chip-grey' : c.passed ? 'chip-green' : 'chip-red'
                          }`}
                        >
                          {c.passed === null ? 'not evaluated' : c.passed ? 'pass' : 'fail'}
                        </span>
                      </div>
                    ))
                  )}
                  {candidate.is_feasible && (
                    <div style={{ marginTop: 12 }}>
                      <Note tone="amber">
                        “Feasible” means every constraint you configured passed. It is not a
                        statement that the design is safe, certified or ready to manufacture.
                      </Note>
                    </div>
                  )}
                </Panel>

                <Panel title="Solver &amp; mesh">
                  <div className="row-sb sm" style={{ padding: '4px 0' }}>
                    <span className="faint">Solver</span>
                    <span className="mono">{study.solver_version}</span>
                  </div>
                  <div className="row-sb sm" style={{ padding: '4px 0' }}>
                    <span className="faint">Mesh nodes</span>
                    <span className="mono">{candidate.mesh_node_count?.toLocaleString() ?? '—'}</span>
                  </div>
                  <div className="row-sb sm" style={{ padding: '4px 0' }}>
                    <span className="faint">Solve time</span>
                    <span className="mono">
                      {candidate.solve_time_seconds ? `${candidate.solve_time_seconds.toFixed(1)} s` : '—'}
                    </span>
                  </div>
                  <div className="row-sb sm" style={{ padding: '4px 0' }}>
                    <span className="faint">Geometry hash</span>
                    <span className="mono xs">{candidate.geometry_hash.slice(0, 16)}</span>
                  </div>

                  {candidate.warnings.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <Note tone="amber">
                        <strong>Warnings from this run</strong>
                        <ul className="ul xs">
                          {candidate.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </Note>
                    </div>
                  )}
                </Panel>

                {study.mesh_convergence?.statement && (
                  <Note
                    tone={
                      study.mesh_convergence.verdict_changed
                        ? 'red'
                        : study.mesh_convergence.converged
                          ? 'green'
                          : 'amber'
                    }
                  >
                    <strong>Mesh convergence</strong>
                    <div style={{ marginTop: 4 }}>{study.mesh_convergence.statement}</div>
                  </Note>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
