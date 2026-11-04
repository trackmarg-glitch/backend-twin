import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from '../api/client';
import { solverStore } from '../api/solverRun';
import type { ComponentType, StudyResult } from '../api/types';
import { useBackend } from '../api/useBackend';
import { Badge, Panel } from '../ui/primitives';
import type { ComponentId } from '../workspace/designs';
import { ResultViewer } from './ResultViewer';
import './viewer.css';

const TYPE_OF: Record<ComponentId, ComponentType> = { 'brake-caliper': 'brake_caliper', 'spark-plug': 'spark_plug' };
const TYPE_LABEL: Record<ComponentType, string> = { alloy_wheel: 'Alloy wheel', brake_caliper: 'Brake caliper', spark_plug: 'Spark plug' };

const when = (s?: string | null) =>
  s ? new Date(s.endsWith('Z') ? s : `${s}Z`).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Completed studies, newest first, with their candidates. */
async function loadStudies(): Promise<StudyResult[]> {
  const list = await api.listStudies();
  const done = list.filter((s) => s.status === 'completed').map((s) => String(s.optimization_run_id));
  const studies = await Promise.all(done.map((id) => api.study(id).catch(() => null)));
  return studies
    .filter((s): s is StudyResult => !!s)
    .sort((a, b) => String(b.completed_at ?? '').localeCompare(String(a.completed_at ?? '')));
}

/**
 * Solver results in 3D: pick a completed backend study and one of its solved
 * candidates, and see its finite-element mesh, temperature field or stress
 * field. Reloads when a new study finishes in the "Run on solver" panel.
 */
export function SolverResults3D({ component }: { component: ComponentId }) {
  const backend = useBackend();
  const solver = useSyncExternalStore(solverStore.subscribe, solverStore.get);
  const [studies, setStudies] = useState<StudyResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allTypes, setAllTypes] = useState(false);
  const [studyId, setStudyId] = useState<string | null>(null);
  const [candId, setCandId] = useState<string | null>(null);
  // A study finishing in the solver panel shows up here without a reload.
  const finished = Object.values(solver.study)
    .map((s) => s?.optimization_run_id ?? '')
    .join(',');

  useEffect(() => {
    if (backend.status !== 'online') return;
    let live = true;
    setError(null);
    loadStudies()
      .then((s) => live && setStudies(s))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [backend.status, finished]);

  // Only show the offline message when nothing has loaded yet: a single slow health
  // check (e.g. while a solve is running) must not wipe a result you are looking at.
  if (backend.status !== 'online' && !studies) {
    return (
      <Panel title="Solver results in 3D">
        <div className="hint">
          {backend.status === 'checking'
            ? 'Checking the backend…'
            : 'The backend is offline. Start it to view finite-element meshes and temperature or stress fields from solver runs.'}
        </div>
      </Panel>
    );
  }

  const type = TYPE_OF[component];
  const shown = (studies ?? []).filter((s) => allTypes || s.component_type === type);
  const study = shown.find((s) => s.optimization_run_id === studyId) ?? shown[0] ?? null;
  const solved = study ? study.candidates.filter((c) => !!c.fields_url) : [];
  const cand =
    solved.find((c) => c.candidate_id === candId) ??
    solved.find((c) => c.candidate_id === study?.recommended_candidate_id) ??
    solved[0] ??
    null;

  return (
    <Panel
      title="Solver results in 3D"
      right={
        <div className="panel-actions">
          <Badge kind="model" label="Solver result" />
          <label className="an-check rs-all">
            <input type="checkbox" checked={allTypes} onChange={(e) => setAllTypes(e.target.checked)} />
            All components
          </label>
        </div>
      }
    >
      {backend.status === 'offline' && studies && (
        <div className="note amber rs-stale">The backend isn&apos;t answering right now; showing the results already loaded.</div>
      )}
      {error && <div className="note amber">Could not load studies: {error}</div>}
      {!studies && !error && <div className="hint">Loading completed studies…</div>}
      {studies && shown.length === 0 && (
        <div className="hint">
          No completed {allTypes ? '' : `${TYPE_LABEL[type].toLowerCase()} `}solver study yet. Run one in the “Run on solver”
          panel above; its mesh and field appear here when it finishes.
        </div>
      )}
      {study && (
        <>
          <div className="rs-pickers">
            <label className="stack-field">
              <span>Study</span>
              <select
                className="select"
                value={study.optimization_run_id}
                onChange={(e) => {
                  setStudyId(e.target.value);
                  setCandId(null);
                }}
              >
                {shown.map((s) => (
                  <option key={s.optimization_run_id} value={s.optimization_run_id}>
                    {TYPE_LABEL[s.component_type]} · {s.analysis_type.replace(/_/g, ' ')} · {when(s.completed_at)} · {s.candidates.length} candidates
                  </option>
                ))}
              </select>
            </label>
            <div className="rs-cands" role="radiogroup" aria-label="Candidate">
              {solved.map((c) => (
                <button
                  key={c.candidate_id}
                  role="radio"
                  aria-checked={c.candidate_id === cand?.candidate_id}
                  className={`rs-cand ${c.candidate_id === cand?.candidate_id ? 'active' : ''}`}
                  onClick={() => setCandId(c.candidate_id)}
                  title={c.candidate_id}
                >
                  <span>#{c.index}</span>
                  {c.candidate_id === study.baseline_candidate_id && <small>baseline</small>}
                  {c.candidate_id === study.recommended_candidate_id && <small>recommended</small>}
                  <span className={c.is_feasible ? 'rs-ok' : 'rs-bad'}>{c.is_feasible ? '✓ feasible' : '✕ infeasible'}</span>
                </button>
              ))}
              {solved.length === 0 && <span className="hint">No candidate in this study has a stored result field.</span>}
            </div>
          </div>
          {cand && (
            <ResultViewer
              key={cand.candidate_id}
              candidateId={cand.candidate_id}
              title={`${TYPE_LABEL[study.component_type]} · candidate #${cand.index} · ${study.solver_name}`}
            />
          )}
        </>
      )}
    </Panel>
  );
}
