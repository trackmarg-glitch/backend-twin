import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { navigate } from '../app/routes';
import { CadViewer } from './CadViewer';
import { ACCEPT, CAD_FORMATS, importCad } from './cadImport';
import type { ImportedCad } from './cadImport';
import { INDUSTRIES, MATERIALS, findIndustry, findMaterial } from './catalog';
import { UNIT_TO_MM, fmtMass, fmtMm, massKg, meshStats, unitWarning } from './geometry';
import type { LengthUnit } from './geometry';
import { customComponents } from './store';
import './customComponents.css';

/** The "+ Add component" button and its dialog. Self-contained, so it can sit in any page header. */
export function AddComponentButton({ className = 'btn' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        + Add component
      </button>
      {open && createPortal(<AddComponentDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

export function AddComponentDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [industryId, setIndustryId] = useState('automotive');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [materialId, setMaterialId] = useState('al6061');
  const [file, setFile] = useState<File | null>(null);
  const [cad, setCad] = useState<ImportedCad | null>(null);
  const [unit, setUnit] = useState<LengthUnit>('mm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setCad(null);
    setError(null);
    setBusy(true);
    try {
      const r = await importCad(f);
      setCad(r);
      setUnit(r.format.fixedUnit ?? 'mm');
      if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const scale = UNIT_TO_MM[unit];
  const stats = useMemo(() => (cad ? meshStats(cad.positions, scale) : null), [cad, scale]);
  const material = findMaterial(materialId)!;
  const exactVol = cad?.exact?.volume_mm3 ?? null;
  const volume = exactVol ?? (stats?.closed ? stats.volumeMm3 : null);
  const warn = stats ? unitWarning(stats.sizeMm) : null;
  const industry = findIndustry(industryId)!;
  const canSave = !!cad && !!stats && name.trim().length > 0 && !busy;

  const save = async () => {
    if (!cad || !stats) return;
    setBusy(true);
    try {
      const item = await customComponents.add(
        {
          name: name.trim(),
          industryId,
          category: category.trim() || 'Part',
          description: description.trim(),
          materialId,
          densityOverride: null,
          fileName: file!.name,
          formatLabel: cad.format.label,
          fileBytes: file!.size,
          unit,
          stats,
          exact: cad.exact
            ? {
                kernel: cad.exact.kernel,
                solidCount: cad.exact.solid_count,
                faceCount: cad.exact.face_count,
                volumeMm3: cad.exact.volume_mm3,
                areaMm2: cad.exact.surface_area_mm2,
                valid: cad.exact.is_valid,
              }
            : null,
          notes: cad.notes,
        },
        cad.positions,
      );
      onClose();
      navigate({ section: 'dashboard', componentId: item.id });
    } catch (e) {
      setError(`Could not save: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <div className="cc-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="cc-dialog" role="dialog" aria-modal="true" aria-label="Add a component">
        <div className="cc-dialog-head">
          <div>
            <div className="cc-kicker">New component · any industry</div>
            <h2>Add a component from CAD</h2>
          </div>
          <button className="run-done-x" aria-label="Close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>

        <div className="cc-dialog-body">
          <div className="cc-form">
            <label className="cc-field">
              <span>Component name</span>
              <input className="cc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pump impeller rev B" />
            </label>
            <div className="cc-row">
              <label className="cc-field">
                <span>Industry</span>
                <select className="select" value={industryId} onChange={(e) => setIndustryId(e.target.value)}>
                  {INDUSTRIES.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cc-field">
                <span>Part type</span>
                <input className="cc-input" list="cc-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={industry.examples[0]} />
                <datalist id="cc-cats">
                  {industry.examples.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </label>
            </div>
            <label className="cc-field">
              <span>Material</span>
              <select className="select" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
                {[...new Set(MATERIALS.map((m) => m.family))].map((fam) => (
                  <optgroup key={fam} label={fam}>
                    {MATERIALS.filter((m) => m.family === fam).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.densityKgM3} kg/m³
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="cc-field">
              <span>
                Notes <small>optional</small>
              </span>
              <textarea className="cc-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it does, load case, supplier…" />
            </label>

            <div
              className={`cc-drop ${drag ? 'drag' : ''} ${cad ? 'done' : ''}`}
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                pick(e.dataTransfer.files[0]);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
            >
              <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => pick(e.target.files?.[0])} />
              <div className="cc-drop-title">{busy ? 'Reading the CAD file…' : file ? file.name : 'Drop a CAD file here, or click to choose'}</div>
              <div className="cc-drop-sub">
                {file && !busy ? `${(file.size / 1e6).toFixed(2)} MB · click to replace` : CAD_FORMATS.map((f) => f.label).join(' · ')}
              </div>
              <div className="cc-drop-sub muted">STEP / IGES / BREP are read with the OpenCascade CAD kernel (backend, or in the browser if the backend is offline); mesh formats are read in the browser. Up to 64 MB.</div>
            </div>
            {error && <div className="cc-error">{error}</div>}
          </div>

          <div className="cc-preview">
            {cad && stats ? (
              <>
                <CadViewer positions={cad.positions} scale={scale} zUp={cad.format.fixedUnit !== 'm'} height={300} />
                <div className="cc-row cc-unit">
                  <span className="muted">File unit</span>
                  <div className="seg">
                    {(Object.keys(UNIT_TO_MM) as LengthUnit[]).map((u) => (
                      <button key={u} className={unit === u ? 'active' : ''} disabled={!!cad.format.fixedUnit} onClick={() => setUnit(u)}>
                        {u}
                      </button>
                    ))}
                  </div>
                  {cad.format.fixedUnit && <span className="muted">set by the {cad.format.label} format</span>}
                </div>
                {warn && <div className="cc-warn">{warn}</div>}
                <div className="cc-stats">
                  <div>
                    <span>Size (X × Y × Z)</span>
                    <b>
                      {stats.sizeMm.map(fmtMm).join(' × ')}
                    </b>
                  </div>
                  <div>
                    <span>Volume</span>
                    <b>{volume !== null ? `${(volume / 1000).toFixed(volume < 1e4 ? 2 : 0)} cm³` : 'n/a (open mesh)'}</b>
                  </div>
                  <div>
                    <span>Est. mass · {material.name}</span>
                    <b>{volume !== null ? fmtMass(massKg(volume, material.densityKgM3)) : 'n/a'}</b>
                  </div>
                  <div>
                    <span>Triangles</span>
                    <b>{stats.triangles.toLocaleString()}</b>
                  </div>
                </div>
                <ul className="cc-notes">
                  {cad.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                  {!cad.exact && stats.closed === false && <li>The mesh is not closed ({stats.openEdges} open edges), so its volume and mass can't be measured.</li>}
                </ul>
              </>
            ) : (
              <div className="cc-preview-empty">{busy ? 'Reading…' : 'A 3D preview and the measured size, volume and mass appear here.'}</div>
            )}
          </div>
        </div>

        <div className="cc-dialog-foot">
          <span className="muted">Saved in this browser. Geometry and mass are measured; no physics simulation is run on imported parts yet.</span>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!canSave}>
            Add component
          </button>
        </div>
      </div>
    </div>
  );
}
