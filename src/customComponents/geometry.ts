/**
 * Measurements of a triangle mesh (flat xyz triples, three vertices per
 * triangle). Pure maths, no three.js, so it runs in the Node tests.
 */

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in';
export const UNIT_TO_MM: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };

export interface MeshStats {
  triangles: number;
  bboxMinMm: [number, number, number];
  bboxMaxMm: [number, number, number];
  sizeMm: [number, number, number];
  surfaceAreaMm2: number;
  /** Enclosed volume; only meaningful when `closed` is true. */
  volumeMm3: number;
  /** Every edge is shared by exactly two triangles (a watertight shell). null = too large to check. */
  closed: boolean | null;
  /** Edges used by only one triangle (holes in the shell). */
  openEdges: number;
}

const CLOSED_CHECK_MAX_TRIANGLES = 2_000_000;

export function meshStats(pos: ArrayLike<number>, scaleToMm = 1): MeshStats {
  const n = Math.floor(pos.length / 9);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n * 9; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = pos[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  if (!n) {
    min.fill(0);
    max.fill(0);
  }

  let area = 0;
  let vol6 = 0;
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2];
    const bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5];
    const cx = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    area += 0.5 * Math.hypot(nx, ny, nz);
    // Signed volume of the tetrahedron (origin, a, b, c) × 6.
    vol6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }

  let closed: boolean | null = null;
  let openEdges = 0;
  if (n > 0 && n <= CLOSED_CHECK_MAX_TRIANGLES) {
    // Weld vertices on a grid relative to the part size, then count edge uses.
    const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
    const q = diag * 1e-6;
    const ids = new Map<string, number>();
    const vid = (o: number) => {
      const key = `${Math.round(pos[o] / q)},${Math.round(pos[o + 1] / q)},${Math.round(pos[o + 2] / q)}`;
      let id = ids.get(key);
      if (id === undefined) ids.set(key, (id = ids.size));
      return id;
    };
    const edges = new Map<number, number>();
    const big = 1 << 26;
    let degenerate = 0;
    for (let t = 0; t < n; t++) {
      const a = vid(t * 9), b = vid(t * 9 + 3), c = vid(t * 9 + 6);
      if (a === b || b === c || a === c) {
        degenerate++;
        continue;
      }
      for (const [p, r] of [[a, b], [b, c], [c, a]]) {
        const key = p < r ? p * big + r : r * big + p;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    let bad = 0;
    for (const c of edges.values()) {
      if (c === 1) openEdges++;
      if (c !== 2) bad++;
    }
    closed = bad === 0 && edges.size > 0 && degenerate < n;
  }

  const s = scaleToMm;
  return {
    triangles: n,
    bboxMinMm: [min[0] * s, min[1] * s, min[2] * s],
    bboxMaxMm: [max[0] * s, max[1] * s, max[2] * s],
    sizeMm: [(max[0] - min[0]) * s, (max[1] - min[1]) * s, (max[2] - min[2]) * s],
    surfaceAreaMm2: area * s * s,
    volumeMm3: Math.abs(vol6 / 6) * s * s * s,
    closed,
    openEdges,
  };
}

/** Mass from volume (mm³) and density (kg/m³). */
export const massKg = (volumeMm3: number, densityKgM3: number) => volumeMm3 * 1e-9 * densityKgM3;

/**
 * A size that looks like the wrong unit was picked: a part bigger than 50 m or
 * smaller than 0.5 mm overall is almost always a unit mix-up.
 */
export function unitWarning(sizeMm: [number, number, number]): string | null {
  const longest = Math.max(...sizeMm);
  if (longest > 50_000) return `The part is ${(longest / 1000).toFixed(0)} m long. If that is wrong, the file is probably in a smaller unit.`;
  if (longest > 0 && longest < 0.5) return `The part is only ${longest.toFixed(3)} mm long. If that is wrong, the file is probably in metres or inches.`;
  return null;
}

export function fmtMm(v: number) {
  const a = Math.abs(v);
  if (a >= 10_000) return `${(v / 1000).toFixed(2)} m`;
  if (a >= 100) return `${v.toFixed(0)} mm`;
  if (a >= 1) return `${v.toFixed(1)} mm`;
  return `${v.toFixed(3)} mm`;
}

export function fmtMass(kg: number) {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  if (kg >= 1) return `${kg.toFixed(2)} kg`;
  return `${(kg * 1000).toFixed(1)} g`;
}
