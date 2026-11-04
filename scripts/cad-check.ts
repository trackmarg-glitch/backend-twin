// Checks for user-added CAD components (geometry measurements). Run with: npm run test:cad
import { massKg, meshStats, unitWarning } from '../src/customComponents/geometry.ts';
import { CustomComponentStore } from '../src/customComponents/store.ts';
import { MATERIALS, INDUSTRIES } from '../src/customComponents/catalog.ts';

let failures = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failures++;
};
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

/** Axis-aligned box as 12 outward-facing triangles. */
function box(x: number, y: number, z: number): Float32Array {
  const v = [[0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0], [0, 0, z], [x, 0, z], [x, y, z], [0, y, z]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return new Float32Array(f.flatMap((t) => t.flatMap((i) => v[i])));
}

{
  const s = meshStats(box(100, 40, 10));
  check('box: 12 triangles', s.triangles === 12);
  check('box: size', s.sizeMm.join() === '100,40,10', s.sizeMm.join(' × '));
  check('box: volume', near(s.volumeMm3, 40000), s.volumeMm3.toFixed(1));
  check('box: surface area', near(s.surfaceAreaMm2, 2 * (4000 + 1000 + 400)), s.surfaceAreaMm2.toFixed(1));
  check('box: closed', s.closed === true && s.openEdges === 0);
}
{
  const s = meshStats(box(0.1, 0.04, 0.01), 1000); // file in metres
  check('unit scale m → mm: size', near(s.sizeMm[0], 100, 1e-5), s.sizeMm.join(' × '));
  check('unit scale m → mm: volume', near(s.volumeMm3, 40000, 1e-4), s.volumeMm3.toFixed(1));
}
{
  // Inward-facing winding still gives a positive volume.
  const b = box(10, 10, 10);
  for (let t = 0; t < 12; t++) for (let k = 0; k < 3; k++) [b[t * 9 + 3 + k], b[t * 9 + 6 + k]] = [b[t * 9 + 6 + k], b[t * 9 + 3 + k]];
  check('flipped winding: volume positive', near(meshStats(b).volumeMm3, 1000), meshStats(b).volumeMm3.toFixed(2));
}
{
  const open = box(10, 10, 10).slice(0, 10 * 9); // drop the last two triangles (one face)
  const s = meshStats(open);
  check('open mesh: not closed', s.closed === false && s.openEdges > 0, `${s.openEdges} open edges`);
}
{
  check('mass: 40 cm³ of 6061 ≈ 108 g', near(massKg(40000, 2700), 0.108, 1e-9), massKg(40000, 2700).toFixed(4) + ' kg');
  check('unit warning: 120 m part flagged', !!unitWarning([120000, 10, 10]));
  check('unit warning: 0.1 mm part flagged', !!unitWarning([0.1, 0.05, 0.02]));
  check('unit warning: normal part not flagged', unitWarning([250, 80, 40]) === null);
  check('empty mesh does not crash', meshStats(new Float32Array(0)).triangles === 0);
}
{
  check('catalog: 14 industries, unique ids', INDUSTRIES.length === 14 && new Set(INDUSTRIES.map((i) => i.id)).size === 14);
  check('catalog: materials have positive density', MATERIALS.every((m) => m.densityKgM3 > 0) && new Set(MATERIALS.map((m) => m.id)).size === MATERIALS.length);
}
{
  const st = new CustomComponentStore(false);
  const s = meshStats(box(10, 10, 10));
  const base = { name: 'Bracket', industryId: 'aerospace', category: 'Bracket', description: '', materialId: 'ti64', densityOverride: null, fileName: 'b.stl', formatLabel: 'STL', fileBytes: 684, unit: 'mm' as const, stats: s, exact: null, notes: [] };
  const a = await st.add(base, box(10, 10, 10));
  check('store: add + get', st.get(a.id)?.name === 'Bracket');
  check('store: mesh kept', (await st.mesh(a.id))?.length === 108);
  st.update(a.id, { materialId: 'al6061' });
  check('store: update', st.get(a.id)?.materialId === 'al6061');
  await st.remove(a.id);
  check('store: remove', !st.get(a.id) && st.items.length === 0);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall CAD component checks passed');
process.exit(failures ? 1 : 0);
