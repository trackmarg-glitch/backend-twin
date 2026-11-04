/** Export & Reports — the CAD artifacts and the traceability document. */

import { useState } from 'react';
import { PageHead } from '../components/Shell';
import { Empty, Note, Panel, Source, Spin } from '../components/primitives';
import { api, API_BASE } from '../services/api';
import { useStore } from '../store/useStore';
import type { Explanation } from '../types/api';

export function Export() {
  const store = useStore();
  const study = store.study;
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, unknown> | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!study) return;
    setBusy(true);
    setError(null);
    try {
      setLinks(await api.generateReport(study.optimization_run_id));
      setMarkdown(await api.reportMarkdown(study.optimization_run_id));
      setExplanation(await api.explainStudy(study.optimization_run_id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!study) {
    return (
      <>
        <PageHead title="Export & Reports" />
        <div className="main-body">
          <Panel>
            <Empty icon="↧">
              Nothing to export yet.
              <br />
              A report is built from stored solver output, so run a simulation first.
            </Empty>
          </Panel>
        </div>
      </>
    );
  }

  const recommended = study.candidates.find(
    (c) => c.candidate_id === study.recommended_candidate_id,
  );
  const baseline = store.baselineCandidate();

  return (
    <>
      <PageHead
        title="Export & Reports"
        context={study.optimization_run_id}
        actions={
          <button className="btn btn-primary" onClick={generate} disabled={busy}>
            {busy ? <Spin /> : null} Generate engineering report
          </button>
        }
      />

      <div className="main-body">
        <div className="col">
          <div className="split">
            <Panel title="CAD exports" badge={<Source kind="solver" />}>
              <p className="sm faint" style={{ marginTop: 0 }}>
                Each design is written as an ISO 10303 STEP file in metres and reopens in
                any CAD application.
              </p>
              <div className="col-sm" style={{ marginTop: 12 }}>
                {recommended?.step_url && (
                  <a
                    className="btn btn-primary btn-block"
                    href={api.assetUrl(`${recommended.step_url}?download=true`)}
                    download
                  >
                    ↧ Recommended design — candidate {recommended.index}
                  </a>
                )}
                {baseline?.step_url && (
                  <a
                    className="btn btn-block"
                    href={api.assetUrl(`${baseline.step_url}?download=true`)}
                    download
                  >
                    ↧ Original design (baseline)
                  </a>
                )}
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="section-label">All candidates</div>
                <div className="col-sm">
                  {study.candidates
                    .filter((c) => c.step_url)
                    .map((c) => (
                      <a
                        key={c.candidate_id}
                        className="row-sb sm"
                        style={{
                          padding: '7px 10px',
                          background: 'var(--sunken)',
                          borderRadius: 6,
                          color: 'inherit',
                        }}
                        href={api.assetUrl(`${c.step_url}?download=true`)}
                        download
                      >
                        <span>
                          {c.is_baseline ? 'Original' : `Candidate ${c.index}`}
                          {!c.evaluated && (
                            <span className="chip chip-red" style={{ marginLeft: 7 }}>
                              no result
                            </span>
                          )}
                        </span>
                        <span className="cyan">↧ STEP</span>
                      </a>
                    ))}
                </div>
              </div>
            </Panel>

            <Panel title="What the report contains">
              <ul className="ul sm" style={{ marginTop: 0 }}>
                <li>The exact specification that was run, with units</li>
                <li>Solver name, version and its benchmark verification results</li>
                <li>Every candidate, including those that produced no result</li>
                <li>Constraint verdicts with the provenance of each limit</li>
                <li>Assumptions labelled by source</li>
                <li>Standing limitations and recommended next steps</li>
              </ul>

              {links && (
                <div className="btn-row" style={{ marginTop: 16 }}>
                  <a
                    className="btn"
                    href={`${API_BASE}${String(links.markdown_url)}?download=true`}
                    download
                  >
                    ↧ Markdown
                  </a>
                  <a
                    className="btn"
                    href={`${API_BASE}${String(links.json_url)}?download=true`}
                    download
                  >
                    ↧ JSON
                  </a>
                </div>
              )}

              {error && (
                <div style={{ marginTop: 13 }}>
                  <Note tone="red">{error}</Note>
                </div>
              )}
            </Panel>
          </div>

          {explanation && (
            <Panel title="Engineering assessment" badge={<Source kind="solver" />}>
              <p className="sm faint" style={{ marginTop: 0 }}>
                Generated from the stored solver output. Every number below is read from a
                saved record — the assistant cannot change a recommendation or supply a
                value the solver did not produce.
              </p>
              <div style={{ fontSize: 14, fontWeight: 600, margin: '12px 0 8px' }}>
                {explanation.headline}
              </div>
              {explanation.paragraphs.map((p) => (
                <p key={p} className="sm" style={{ margin: '0 0 9px', lineHeight: 1.65 }}>
                  {p}
                </p>
              ))}
              {explanation.caveats.length > 0 && (
                <Note tone="amber">
                  <strong>Caveats</strong>
                  <ul className="ul">
                    {explanation.caveats.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </Note>
              )}
            </Panel>
          )}

          {study.assumptions.length > 0 && (
            <Panel title="Assumptions on record">
              {study.assumptions.map((a) => (
                <div
                  key={a.key}
                  style={{
                    padding: '10px 12px',
                    marginBottom: 8,
                    background: 'var(--sunken)',
                    borderLeft: '2px solid var(--amber)',
                    borderRadius: 6,
                  }}
                >
                  <div className="row" style={{ gap: 7, marginBottom: 4 }}>
                    <span className="mono xs" style={{ color: 'var(--amber)' }}>{a.key}</span>
                    {a.confirmed && <span className="chip chip-green">accepted</span>}
                  </div>
                  <div className="sm dim">{a.statement}</div>
                </div>
              ))}
            </Panel>
          )}

          {markdown && (
            <Panel title="Report preview">
              <pre className="code">{markdown}</pre>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
