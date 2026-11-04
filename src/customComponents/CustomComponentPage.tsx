import { useEffect, useState } from 'react';
import { navigate } from '../app/routes';
import { useStoreVersion } from '../core/useStoreVersion';
import { fmtDateTime } from '../pages/shared';
import { Badge, Panel } from '../ui/primitives';
import { CadViewer } from './CadViewer';
import { MATERIALS, findIndustry, findMaterial } from './catalog';
import { UNIT_TO_MM, fmtMass, fmtMm, massKg } from './geometry';
import { customComponents } from './store';
import type { CustomComponent } from './store';
import { AddComponentButton } from './AddComponentDialog';
import './customComponents.css';

/** Binary STL in millimetres, for taking the part into another tool. */
function downloadStl(c: CustomComponent, pos: Float32Array) {
  const n = Math.floor(pos.length / 9);
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const head = `AutoTwin export: ${c.name}`.slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  const s = UNIT_TO_MM[c.unit];
  let o = 84;
  for (let t = 0; t < n; t++) {
    o += 12; // normal left as zero; readers recompute it
    for (let k = 0; k < 9; k++, o += 4) dv.setFloat32(o, pos[t * 9 + k] * s, true);
    o += 2;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'model/stl' }));
  a.download = `${c.name.replace(/[^\w.-]+/g, '_')}.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function CustomComponentPage({ id }: { id: string }) {
  useStoreVersion(customComponents);
  const c = customComponents.get(id);
  const [mesh, setMesh] = useState<Float32Array | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setMesh(undefined);
    customComponents.mesh(id).then((m) => live && setMesh(m));
    return () => {
      live = false;
    };
  }, [id]);

  if (!c) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Component not found</h1>
            <div className="page-sub">It may have been deleted, or added in another browser.</div>
          </div>
          <div className="page-actions">
            <button className="btn" onClick={() => navigate({ section: 'dashboard' })}>
              ← Dashboard
            </button>
            <AddComponentButton className="btn primary" />
          </div>
        </div>
      </div>
    );
  }

  const mat = findMaterial(c.materialId) ?? MATERIALS[0];
  const density = c.densityOverride ?? mat.densityKgM3;
  const volume = c.exact?.volumeMm3 ?? (c.stats.closed ? c.stats.volumeMm3 : null);
  const area = c.exact?.areaMm2 ?? c.stats.surfaceAreaMm2;
  const mass = volume !== null ? massKg(volume, density) : null;
  const [sx, sy, sz] = c.stats.sizeMm;
  const envelope = sx * sy * sz;
  const industry = findIndustry(c.industryId);

  const remove = async () => {
    if (!window.confirm(`Delete “${c.name}” from this browser?`)) return;
    await customComponents.remove(c.id);
    navigate({ section: 'dashboard' });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{c.name}</h1>
          <div className="page-sub">
            {industry?.label ?? 'Other'} · {c.category} · {c.formatLabel} · {c.fileName} · added {fmtDateTime(c.createdAt)}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => navigate({ section: 'dashboard' })}>
            ← Dashboard
          </button>
          <button className="btn" disabled={!mesh} onClick={() => mesh && downloadStl(c, mesh)}>
            Download STL (mm)
          </button>
          <button className="btn" onClick={remove}>
            Delete
          </button>
          <AddComponentButton className="btn primary" />
        </div>
      </div>

      <div className="cc-page-grid">
        <Panel title="3D model" right={<Badge kind={c.exact ? 'input' : 'derived'} label={c.exact ? 'Exact CAD' : 'Mesh'} />}>
          {mesh === undefined ? (
            <div className="cc-preview-empty" style={{ height: 520 }}>
              Loading the model…
            </div>
          ) : mesh === null ? (
            <div className="cc-preview-empty" style={{ height: 520 }}>
              The mesh for this component isn’t stored in this browser any more. Delete it and add the CAD file again.
            </div>
          ) : (
            <CadViewer positions={mesh} scale={UNIT_TO_MM[c.unit]} zUp={c.unit !== 'm'} height={520} />
          )}
        </Panel>

        <div className="cc-side">
          <Panel title="Measured geometry" right={<Badge kind={c.exact ? 'input' : 'derived'} label={c.exact ? c.exact.kernel : 'From mesh'} />}>
            <div className="cc-props">
              <Prop l="Size X × Y × Z" v={`${fmtMm(sx)} × ${fmtMm(sy)} × ${fmtMm(sz)}`} />
              <Prop l="Volume" v={volume !== null ? `${(volume / 1000).toFixed(volume < 1e4 ? 2 : 1)} cm³` : 'n/a (open mesh)'} />
              <Prop l="Surface area" v={`${(area / 100).toFixed(area < 1e4 ? 2 : 0)} cm²`} />
              <Prop l="Fill of bounding box" v={volume !== null && envelope > 0 ? `${((volume / envelope) * 100).toFixed(1)} %` : '–'} />
              {c.exact ? (
                <>
                  <Prop l="Solids · faces" v={`${c.exact.solidCount} · ${c.exact.faceCount}`} />
                  <Prop l="Kernel validity" v={c.exact.valid ? 'valid' : 'invalid (may not mesh)'} />
                </>
              ) : (
                <Prop l="Watertight" v={c.stats.closed === null ? 'too large to check' : c.stats.closed ? 'yes' : `no (${c.stats.openEdges} open edges)`} />
              )}
              <Prop l="Display triangles" v={c.stats.triangles.toLocaleString()} />
              <Prop l="File" v={`${(c.fileBytes / 1e6).toFixed(2)} MB · unit ${c.unit}`} />
            </div>
          </Panel>

          <Panel title="Material & mass" right={<Badge kind="estimated" />}>
            <label className="cc-field">
              <span>Material</span>
              <select className="select" value={c.materialId} onChange={(e) => customComponents.update(c.id, { materialId: e.target.value, densityOverride: null })}>
                {[...new Set(MATERIALS.map((m) => m.family))].map((fam) => (
                  <optgroup key={fam} label={fam}>
                    {MATERIALS.filter((m) => m.family === fam).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="cc-props">
              <Prop l="Density" v={`${density} kg/m³${c.densityOverride ? ' (custom)' : ''}`} />
              <Prop l="Young’s modulus" v={mat.youngsGPa !== null ? `${mat.youngsGPa} GPa` : '–'} />
              <Prop l={mat.family === 'Polymer' || mat.family === 'Composite' ? 'Tensile strength' : 'Yield strength'} v={mat.strengthMPa !== null ? `${mat.strengthMPa} MPa` : '–'} />
              <Prop l="Estimated mass" v={mass !== null ? fmtMass(mass) : 'n/a'} strong />
            </div>
            <div className="hint">Typical handbook values. Mass = measured volume × density; real parts differ with porosity, coatings and tolerances.</div>
          </Panel>

          <Panel title="What this twin can do">
            <ul className="cc-notes">
              <li>
                <b>Now:</b> view the part in 3D, measure its size, volume and surface area, and estimate its mass in any material.
              </li>
              <li>
                <b>Not yet:</b> a stress, thermal or motion simulation. That needs loads and supports on this geometry, and the live physics twins only exist for the brake caliper, spark plug and alloy wheel.
              </li>
              {c.notes.map((n, i) => (
                <li key={i} className="muted">
                  {n}
                </li>
              ))}
              {c.description && <li>Notes: {c.description}</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Prop({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return (
    <div className={`cc-prop ${strong ? 'strong' : ''}`}>
      <span>{l}</span>
      <b>{v}</b>
    </div>
  );
}

/** Dashboard list of added components. Renders nothing until there is one. */
export function CustomComponentsPanel() {
  useStoreVersion(customComponents);
  const items = customComponents.items;
  if (!items.length) return null;
  return (
    <Panel title={`Your components (${items.length})`} right={<AddComponentButton className="btn sm" />}>
      <div className="cc-cards">
        {items.map((c) => {
          const m = findMaterial(c.materialId);
          const vol = c.exact?.volumeMm3 ?? (c.stats.closed ? c.stats.volumeMm3 : null);
          const mass = vol !== null && m ? fmtMass(massKg(vol, c.densityOverride ?? m.densityKgM3)) : null;
          return (
            <button key={c.id} className="cc-card" onClick={() => navigate({ section: 'dashboard', componentId: c.id })}>
              <span className="cc-card-ind">{findIndustry(c.industryId)?.label ?? 'Other'}</span>
              <span className="cc-card-name">{c.name}</span>
              <span className="muted">
                {c.category} · {c.formatLabel}
              </span>
              <span className="cc-card-meta">
                {c.stats.sizeMm.map(fmtMm).join(' × ')}
                {mass && ` · ${mass}`}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
