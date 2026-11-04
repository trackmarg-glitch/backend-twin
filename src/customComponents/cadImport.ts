/**
 * Reads a CAD file into one flat triangle list.
 *
 *  - Mesh formats (STL, OBJ, PLY, 3MF, GLB, glTF with embedded data) are read
 *    in the browser with the three.js loaders.
 *  - Exact B-rep formats (STEP, IGES, BREP) need a CAD kernel, so they go to
 *    the backend (/api/cad/inspect, OpenCascade), which measures them exactly
 *    and sends back a display mesh. Nothing is kept on the server.
 */
import * as THREE from 'three';
import { API_BASE } from '../api/client';
import type { LengthUnit } from './geometry';

export interface CadFormat {
  ext: string[];
  label: string;
  where: 'browser' | 'backend';
  /** The unit the format itself defines, if any. */
  fixedUnit?: LengthUnit;
}

export const CAD_FORMATS: CadFormat[] = [
  { ext: ['step', 'stp'], label: 'STEP', where: 'backend', fixedUnit: 'mm' },
  { ext: ['iges', 'igs'], label: 'IGES', where: 'backend', fixedUnit: 'mm' },
  { ext: ['brep', 'brp'], label: 'BREP', where: 'backend', fixedUnit: 'mm' },
  { ext: ['stl'], label: 'STL', where: 'browser' },
  { ext: ['obj'], label: 'OBJ', where: 'browser' },
  { ext: ['ply'], label: 'PLY', where: 'browser' },
  { ext: ['3mf'], label: '3MF', where: 'browser', fixedUnit: 'mm' },
  { ext: ['glb', 'gltf'], label: 'glTF / GLB', where: 'browser', fixedUnit: 'm' },
];

export const ACCEPT = CAD_FORMATS.flatMap((f) => f.ext.map((e) => '.' + e)).join(',');
export const MAX_FILE_BYTES = 64 * 1024 * 1024;

export const formatOf = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return CAD_FORMATS.find((f) => f.ext.includes(ext));
};

export interface BackendInspection {
  kernel: string;
  solid_count: number;
  face_count: number;
  is_valid: boolean;
  volume_mm3: number | null;
  surface_area_mm2: number;
  triangle_count: number;
  units: { declared_length_unit: string | null; note?: string };
  warnings: string[];
}

export interface ImportedCad {
  format: CadFormat;
  /** Flat xyz triples, three vertices per triangle, in the file's own units. */
  positions: Float32Array;
  /** Exact measurements when the file went through the CAD kernel. */
  exact?: BackendInspection;
  notes: string[];
}

function positionsFrom(root: THREE.Object3D): Float32Array {
  root.updateMatrixWorld(true);
  const parts: Float32Array[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    let g = mesh.geometry as THREE.BufferGeometry;
    g = g.index ? g.toNonIndexed() : g.clone();
    g.applyMatrix4(mesh.matrixWorld);
    parts.push(g.attributes.position.array as Float32Array);
  });
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function positionsOfGeometry(g: THREE.BufferGeometry): Float32Array {
  const ng = g.index ? g.toNonIndexed() : g;
  return new Float32Array(ng.attributes.position.array as ArrayLike<number>);
}

async function readInBrowser(file: File, format: CadFormat): Promise<Float32Array> {
  const ext = file.name.split('.').pop()!.toLowerCase();
  const buf = await file.arrayBuffer();
  switch (ext) {
    case 'stl': {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      return positionsOfGeometry(new STLLoader().parse(buf));
    }
    case 'ply': {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
      return positionsOfGeometry(new PLYLoader().parse(buf));
    }
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      return positionsFrom(new OBJLoader().parse(new TextDecoder().decode(buf)));
    }
    case '3mf': {
      const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
      return positionsFrom(new ThreeMFLoader().parse(buf));
    }
    case 'glb':
    case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().parseAsync(buf, '');
      return positionsFrom(gltf.scene);
    }
  }
  throw new Error(`${format.label} files are not supported in the browser`);
}

async function readOnBackend(file: File): Promise<{ positions: Float32Array; exact: BackendInspection }> {
  const body = new FormData();
  body.append('file', file, file.name);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/cad/inspect`, { method: 'POST', body });
  } catch {
    throw new Error('STEP, IGES and BREP files are read by the AutoTwin backend, which is not reachable. Start the backend, or export the part as STL / OBJ / 3MF / GLB instead.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    if (res.status === 404) throw new Error('The backend is running an older version without CAD import. Restart it to load the new /api/cad/inspect route.');
    if (res.status === 502 || res.status === 504) throw new Error('The AutoTwin backend is not running. Start it to import STEP, IGES or BREP files.');
    const detail = data && typeof data === 'object' && 'detail' in data ? String((data as { detail: unknown }).detail) : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  const j = data as BackendInspection & { positions_f32_b64: string };
  const bin = atob(j.positions_f32_b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const { positions_f32_b64: _drop, ...exact } = j;
  return { positions: new Float32Array(bytes.buffer), exact };
}

let occtPromise: Promise<import('occt-import-js').Occt> | null = null;

/** OpenCascade in the browser (WebAssembly, ~8 MB, loaded only when first needed). */
function loadOcct() {
  if (!occtPromise) {
    occtPromise = (async () => {
      const [{ default: init }, { default: wasmUrl }] = await Promise.all([
        import('occt-import-js'),
        import('occt-import-js/dist/occt-import-js.wasm?url'),
      ]);
      return init({ locateFile: () => wasmUrl });
    })();
    occtPromise.catch(() => (occtPromise = null));
  }
  return occtPromise;
}

/** STEP / IGES / BREP read in the browser with OpenCascade, output in millimetres. */
async function readBrepInBrowser(file: File): Promise<{ positions: Float32Array; faces: number }> {
  const occt = await loadOcct();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = file.name.split('.').pop()!.toLowerCase();
  const params = { linearUnit: 'millimeter' as const, linearDeflectionType: 'bounding_box_ratio' as const, linearDeflection: 0.001, angularDeflection: 0.3 };
  const r = ext === 'step' || ext === 'stp' ? occt.ReadStepFile(bytes, params) : ext === 'iges' || ext === 'igs' ? occt.ReadIgesFile(bytes, params) : occt.ReadBrepFile(bytes, params);
  if (!r.success || !r.meshes.length) throw new Error('OpenCascade could not read any geometry from this file.');
  const parts: number[][] = [];
  let faces = 0;
  for (const m of r.meshes) {
    const p = m.attributes.position.array;
    const idx = m.index?.array;
    faces += m.brep_faces?.length ?? 0;
    const out: number[] = [];
    if (idx) for (let i = 0; i < idx.length; i++) out.push(p[idx[i] * 3], p[idx[i] * 3 + 1], p[idx[i] * 3 + 2]);
    else for (let i = 0; i < p.length; i++) out.push(p[i]);
    parts.push(out);
  }
  const positions = new Float32Array(parts.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of parts) {
    positions.set(a, o);
    o += a.length;
  }
  if (positions.length < 9) throw new Error('The file has no surfaces to show.');
  return { positions, faces };
}

export async function importCad(file: File): Promise<ImportedCad> {
  const format = formatOf(file.name);
  if (!format) throw new Error(`Unsupported file type. Accepted: ${CAD_FORMATS.map((f) => f.label).join(', ')}.`);
  if (file.size === 0) throw new Error('The file is empty.');
  if (file.size > MAX_FILE_BYTES) throw new Error(`The file is ${(file.size / 1e6).toFixed(1)} MB; the limit is ${MAX_FILE_BYTES / 1e6} MB.`);

  const notes: string[] = [];
  if (format.where === 'backend') {
    // Prefer the backend kernel (exact volume, validity check); fall back to
    // OpenCascade in the browser so the import works without the backend.
    let backendError: Error | null = null;
    try {
      const { positions, exact } = await readOnBackend(file);
      notes.push(`Read exactly by ${exact.kernel}: ${exact.solid_count} solid(s), ${exact.face_count} faces.`);
      if (exact.units.declared_length_unit) notes.push(`The file declares ${exact.units.declared_length_unit}; values are shown in mm.`);
      notes.push(...exact.warnings);
      return { format, positions, exact, notes };
    } catch (e) {
      backendError = e as Error;
    }
    try {
      const { positions, faces } = await readBrepInBrowser(file);
      notes.push(`Read in the browser by OpenCascade (WebAssembly)${faces ? `: ${faces} faces` : ''}. Volume is measured from the tessellated surface.`);
      return { format, positions, notes };
    } catch (e) {
      throw new Error(`Could not read this ${format.label} file. Backend: ${backendError?.message ?? 'n/a'} Browser: ${(e as Error).message}`);
    }
  }
  const positions = await readInBrowser(file, format);
  if (positions.length < 9) throw new Error('No triangles were found in the file. If it is a glTF with a separate .bin file, export it as a single .glb instead.');
  notes.push(`${format.label} is a mesh format: geometry is measured from its triangles.`);
  if (!format.fixedUnit) notes.push(`${format.label} files carry no unit. Check the unit so the size and mass come out right.`);
  return { format, positions, notes };
}
