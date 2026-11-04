/** Design Comparison — original versus optimised, and every candidate.
 *
 * Failed candidates stay in the table with their reason. Dropping them would
 * make the search look cleaner than it was, and they are often the most
 * informative rows: they mark where the design space runs out. */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConvergenceChip, MaturityBadge } from '../components/assurance';
import { PageHead } from '../components/Shell';
import {
  Delta,
  Empty,
  Note,
  Panel,
  Source,
  StatusChip,
  fmt,
} from '../components/primitives';
import { useStore } from '../store/useStore';

const LOWER_IS_BETTER: Record<string, boolean> = {
  mass_kg: true,
  max_von_mises_pa: true,
  max_displacement_m: true,
  compliance_j: true,
  min_factor_of_safety: false,
  max_temperature_k: true,
  max_temperature_gradient_k_per_m: true,
  heat_flow_w: true,
};

const STRUCT_COLS = [
  { key: 'mass_kg', label: 'Mass' },
  { key: 'max_von_mises_pa', label: 'Peak stress' },
  { key: 'max_displacement_m', label: 'Max displ.' },
  { key: 'min_factor_of_safety', label: 'FoS' },
];

const THERM_COLS = [
  { key: 'max_temperature_k', label: 'Peak temp' },
  { key: 'min_temperature_k', label: 'Min temp' },
  { key: 'heat_flow_w', label: 'Heat flow' },
];

export function Comparison() {
  const store = useStore();
  const navigate = useNavigate();
  const study = store.study;

  const ordered = useMemo(
    () =>
      [...(study?.candidates ?? [])].sort((a, b) => {
        if (a.is_baseline !== b.is_baseline) return a.is_baseline ? -1 : 1;
        if (a.rank && b.rank) return a.rank - b.rank;
        if (a.rank) return -1;
        if (b.rank) return 1;
        return a.index - b.index;
      }),
    [study],
  );

  if (!study) {
    return (
      <>
        <PageHead title="Design Comparison" />
        <div className="main-body">
          <Panel>
            <Empty icon="⇄">
              Nothing to compare yet.
              <br />
              Generate candidates in <strong>New Design</strong> first.
            </Empty>
          </Panel>
        </div>
      </>
    );
  }

  const thermal = study.analysis_type === 'steady_state_thermal';
  const columns = thermal ? THERM_COLS : STRUCT_COLS;
  const entries = Object.entries(study.comparison).filter(([, e]) => e.available);

  return (
    <>
      <PageHead
        title="Design Comparison"
        context={
          <>
            {study.algorithm} · {study.summary.candidates_evaluated} solved of{' '}
            {study.summary.candidates_generated} generated
          </>
        }
      />

      <div className="main-body">
        <div className="col">
          {study.recommendation?.statement && (
            <Note tone={study.recommendation.improves_on_baseline ? 'green' : 'amber'}>
              <strong>
                {study.recommendation.improves_on_baseline
                  ? 'Recommended design'
                  : 'No improvement found'}
              </strong>
              <div style={{ marginTop: 4 }}>{study.recommendation.statement}</div>
            </Note>
          )}

          {entries.length > 0 && (
            <Panel title="Original versus optimised" badge={<Source kind="solver" />}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="n">Original</th>
                    <th className="n">Optimised</th>
                    <th className="n">Change</th>
                    <th>Units</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(([metric, e]) => (
                    <tr key={metric}>
                      <td className="t dim">{metric.replace(/_/g, ' ')}</td>
                      <td className="n">{fmt(e.baseline!.value)}</td>
                      <td className="n">{fmt(e.candidate!.value)}</td>
                      <td className="n">
                        <Delta
                          percent={e.percent_change}
                          lowerIsBetter={LOWER_IS_BETTER[metric] ?? true}
                        />
                      </td>
                      <td className="faint">{e.candidate!.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 13 }}>
                <Note tone="cyan">
                  Both columns come from the same solver configuration, the same mesh
                  settings and the same load case, so this is a like-for-like comparison.
                  A passing result is not a statement that the design is production-ready.
                </Note>
              </div>
            </Panel>
          )}

          <Panel
            title="All generated candidates"
            badge={
              study.summary.candidates_failed > 0 ? (
                <span className="chip chip-red">{study.summary.candidates_failed} failed</span>
              ) : undefined
            }
          >
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Design</th>
                    <th>Status</th>
                    {columns.map((c) => (
                      <th key={c.key} className="n">{c.label}</th>
                    ))}
                    <th className="n">Rank</th>
                    <th>Evidence</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((c) => (
                    <tr
                      key={c.candidate_id}
                      className={`click ${c.candidate_id === store.selectedCandidateId ? 'on' : ''}`}
                      onClick={() => {
                        store.selectCandidate(c.candidate_id);
                        navigate('/results');
                      }}
                    >
                      <td>
                        {c.is_baseline ? (
                          <span className="chip chip-grey">original</span>
                        ) : (
                          `#${String(c.index).padStart(2, '0')}`
                        )}
                        {c.candidate_id === study.recommended_candidate_id && (
                          <span className="chip chip-green" style={{ marginLeft: 6 }}>★</span>
                        )}
                      </td>
                      <td>
                        <StatusChip status={c.status} feasible={c.is_feasible} />
                      </td>
                      {columns.map((col) => {
                        const v = c.display_metrics[col.key];
                        return (
                          <td key={col.key} className="n">
                            {v ? fmt(v.value) : <span className="faint">—</span>}
                          </td>
                        );
                      })}
                      <td className="n">{c.rank ?? <span className="faint">—</span>}</td>
                      <td>
                        <MaturityBadge assurance={c.assurance} compact />
                      </td>
                      <td className="t faint" style={{ maxWidth: 300 }}>
                        {c.failure_reason ?? c.infeasibility_reasons.join('; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="xs faint" style={{ marginTop: 10, lineHeight: 1.6 }}>
              A dash means the solver did not produce that metric. Designs that failed
              geometry, meshing or the solve carry no values at all and cannot be ranked
              or recommended. Units:{' '}
              {thermal ? '°C for temperature, W for heat flow' : 'kg, MPa, mm'}.
            </div>
          </Panel>

          {study.mesh_convergence?.performed && (
            <Panel
              title="Mesh convergence check"
              badge={<ConvergenceChip mesh={study.mesh_convergence} />}
            >
              <div className="sm">{study.mesh_convergence.statement}</div>
              <table className="tbl" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="n">Coarse mesh</th>
                    <th className="n">Refined mesh</th>
                    <th className="n">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(study.mesh_convergence.metrics)
                    .filter(([, e]) => e.available)
                    .map(([metric, e]) => (
                      <tr key={metric}>
                        <td className="t dim">{metric.replace(/_/g, ' ')}</td>
                        <td className="n">{fmt(e.coarse)}</td>
                        <td className="n">{fmt(e.fine)}</td>
                        <td className="n" style={{ color: e.converged ? 'var(--green)' : 'var(--amber)' }}>
                          {(e.percent_change ?? 0) > 0 ? '+' : ''}
                          {(e.percent_change ?? 0).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
