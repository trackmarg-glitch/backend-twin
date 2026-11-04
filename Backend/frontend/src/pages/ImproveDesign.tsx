/** Improve Existing Design — upload, inspect, and map to a template.
 *
 * The honest part of this page is step 3. An arbitrary STEP file carries no
 * feature model, so it cannot be regenerated parametrically. AutoTwin says so
 * and offers the real path — match it to a built-in template — rather than
 * pretending any uploaded solid can be optimised. */

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../components/Shell';
import { Empty, Note, Panel, Source, Spin, fmt } from '../components/primitives';
import { API_BASE } from '../services/api';
import { useStore } from '../store/useStore';
import type { ComponentType } from '../types/api';

interface Inspection {
  solid_count?: number;
  is_valid_solid?: boolean;
  total_volume_m3?: number;
  bounding_box_size_m?: [number, number, number];
  face_count?: number;
  units?: {
    declared_length_unit?: string | null;
    requires_unit_confirmation?: boolean;
    note?: string;
  };
  warnings?: string[];
  original_filename_as_submitted?: string;
  size_bytes?: number;
  sha256?: string;
}

export function ImproveDesign() {
  const store = useStore();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const meta = store.importedMeta as (Inspection & Record<string, unknown>) | null;

  const upload = async (file: File) => {
    setBusy(true);
    setNote(null);
    store.setImported(null, null);
    try {
      // A component record is needed to own the uploaded asset.
      if (!store.componentType) {
        setNote('Choose which component this file is, so it can be stored against a profile.');
        return;
      }
      const component = await store.ensureComponent();
      if (!component) throw new Error('Could not create the component record.');

      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${API_BASE}/api/components/${component.id}/import`, {
        method: 'POST',
        body: form,
      });
      const body = await response.json();
      if (!response.ok) {
        store.setImported(null, body.detail ?? 'The file could not be read.');
        return;
      }
      store.setImported(body.stored_metadata as Record<string, unknown>, null);
      setNote(body.capability_note as string);
    } catch (error) {
      store.setImported(null, (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="Improve Existing Design"
        context="Upload a CAD model, inspect it, and map it to a parametric template"
      />

      <div className="main-body">
        <div className="col">
          {/* ------------------------------------------------- step 1 */}
          <Panel title="Step 01 · Which component is this?">
            <p className="sm faint" style={{ marginTop: 0, marginBottom: 12 }}>
              The uploaded model is stored against a component profile so its analysis,
              limits and units are known.
            </p>
            <div className="tile-grid">
              {store.profiles.map((p) => (
                <button
                  key={p.component_type}
                  className="tile"
                  style={{
                    padding: 15,
                    borderColor:
                      store.componentType === p.component_type ? 'var(--cyan)' : undefined,
                  }}
                  onClick={() => store.chooseComponent(p.component_type as ComponentType)}
                >
                  <div className="tile-name">{p.display_name}</div>
                  <div className="tile-desc" style={{ minHeight: 0 }}>
                    {p.analysis_type.replace(/_/g, ' ')}
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          {/* ------------------------------------------------- step 2 */}
          <Panel title="Step 02 · Upload CAD file">
            <input
              ref={fileRef}
              type="file"
              accept=".step,.stp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />

            <div
              style={{
                padding: '34px 24px',
                border: '1px dashed var(--line-strong)',
                borderRadius: 'var(--r)',
                textAlign: 'center',
                background: 'var(--sunken)',
              }}
            >
              <div style={{ fontSize: 26, marginBottom: 10, color: 'var(--ink-3)' }}>↥</div>
              <div className="sm" style={{ marginBottom: 6 }}>
                Drop a STEP file here, or
              </div>
              <button
                className="btn btn-primary"
                onClick={() => fileRef.current?.click()}
                disabled={busy || !store.componentType}
              >
                {busy ? <Spin /> : null} Choose file
              </button>
              <div className="xs faint" style={{ marginTop: 12 }}>
                Accepted: .step, .stp — the ISO 10303 exchange format. Maximum 64 MB.
              </div>
              {!store.componentType && (
                <div className="xs" style={{ marginTop: 8, color: 'var(--amber)' }}>
                  Choose a component above first.
                </div>
              )}
            </div>

            {store.importError && (
              <div style={{ marginTop: 13 }}>
                <Note tone="red">
                  <strong>That file could not be used</strong>
                  <div style={{ marginTop: 4 }}>{store.importError}</div>
                  <div className="xs faint" style={{ marginTop: 7 }}>
                    AutoTwin reads STEP solids. IGES, STL, native CAD formats and
                    surface-only models are not supported for analysis.
                  </div>
                </Note>
              </div>
            )}
          </Panel>

          {/* ------------------------------------------------- step 3 */}
          {meta && (
            <>
              <Panel title="Step 03 · What was imported" badge={<Source kind="solver" />}>
                <div className="metrics">
                  <div className="metric">
                    <div className="metric-label">Solids</div>
                    <div className="metric-value">{meta.solid_count ?? '—'}</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Volume</div>
                    <div className="metric-value">
                      {meta.total_volume_m3 != null ? fmt(meta.total_volume_m3 * 1e6) : '—'}
                      <span className="metric-unit">cm³</span>
                    </div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Faces</div>
                    <div className="metric-value">{meta.face_count ?? '—'}</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Valid solid</div>
                    <div className="metric-value" style={{ fontSize: 17 }}>
                      <span className={meta.is_valid_solid ? 'good' : 'bad'}>
                        {meta.is_valid_solid ? 'yes' : 'no'}
                      </span>
                    </div>
                  </div>
                </div>

                {meta.bounding_box_size_m && (
                  <div className="row-sb sm" style={{ marginTop: 14 }}>
                    <span className="faint">Bounding box</span>
                    <span className="mono">
                      {meta.bounding_box_size_m.map((v) => (v * 1000).toFixed(1)).join(' × ')} mm
                    </span>
                  </div>
                )}
                <div className="row-sb sm">
                  <span className="faint">Declared unit</span>
                  <span className="mono">{meta.units?.declared_length_unit ?? 'not declared'}</span>
                </div>
                <div className="row-sb sm">
                  <span className="faint">Checksum</span>
                  <span className="mono xs">{String(meta.sha256 ?? '').slice(0, 20)}</span>
                </div>

                {meta.units?.requires_unit_confirmation && (
                  <div style={{ marginTop: 13 }}>
                    <Note tone="amber">
                      <strong>Confirm the units</strong>
                      <div style={{ marginTop: 4 }}>{meta.units.note}</div>
                    </Note>
                  </div>
                )}

                {(meta.warnings ?? []).length > 0 && (
                  <div style={{ marginTop: 13 }}>
                    <Note tone="amber">
                      <ul className="ul sm" style={{ marginTop: 0 }}>
                        {meta.warnings!.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </Note>
                  </div>
                )}

                <div style={{ marginTop: 13 }}>
                  <Note tone="green">
                    Your original file is stored unchanged and is never overwritten. Every
                    generated design is written as a separate STEP file alongside it.
                  </Note>
                </div>
              </Panel>

              {/* ---------------------------------------------- step 4 */}
              <Panel
                title="Step 04 · What can actually be modified"
                badge={<span className="chip chip-amber">read this</span>}
              >
                <Note tone="amber">
                  <strong>This model cannot be regenerated parametrically</strong>
                  <div style={{ marginTop: 5 }}>
                    {note ??
                      'An imported STEP file carries solid geometry but no feature model, ' +
                        'so there are no named dimensions for the optimizer to change.'}
                  </div>
                </Note>

                <div style={{ marginTop: 16 }}>
                  <div className="section-label">What you can do instead</div>
                  <ol className="ul sm" style={{ paddingLeft: 20 }}>
                    <li>
                      <strong>Analyse it as imported</strong> — it can be meshed and solved
                      to get a baseline for the geometry you already have.
                    </li>
                    <li style={{ marginTop: 6 }}>
                      <strong>Match it to the parametric template</strong> — set the
                      template's dimensions to match this part, then optimise from there.
                      That is the supported route to improved candidates, and it is the one
                      below.
                    </li>
                  </ol>
                </div>

                <div className="btn-row" style={{ marginTop: 16 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      store.goToStep(3);
                      navigate('/new');
                    }}
                  >
                    Match to the {store.profile()?.display_name} template →
                  </button>
                  <a
                    className="btn btn-ghost"
                    href={`${API_BASE}/api/assets/${String(meta.relative_path ?? '')}?download=true`}
                    download
                  >
                    ↧ Download the original back
                  </a>
                </div>

                <div className="xs faint" style={{ marginTop: 12, lineHeight: 1.6 }}>
                  Automatic feature recognition — reading dimensions back out of an
                  arbitrary solid and rebuilding it as a parametric model — is not
                  implemented. AutoTwin will not pretend otherwise.
                </div>
              </Panel>
            </>
          )}

          {!meta && !store.importError && (
            <Panel>
              <Empty icon="⟲">
                Upload a STEP file to inspect it.
                <br />
                If you want to start from scratch instead, use{' '}
                <strong>New Design</strong>.
              </Empty>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
