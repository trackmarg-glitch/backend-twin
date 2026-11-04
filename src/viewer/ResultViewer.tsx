import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { api } from '../api/client';
import type { VisualizationPayload } from '../api/types';
import { CameraRig, StudioEnvironment } from '../three/common';
import type { CameraPreset } from '../three/common';
import { ThemeBackground } from '../theme/ThemeBackground';
import './viewer.css';

/**
 * 3D view of one solved candidate, straight from the backend's stored result
 * field (GET /candidates/{id}/visualization). Nothing here is estimated or
 * made up: the mesh is the surface of the finite-element mesh the solver
 * used, and every colour is a value the solver computed at that node.
 *
 *  - Mesh structure: each surface face drawn as its own chunk, with its edges
 *    and the overall dimensions, so the shape, structure and size are clear.
 *  - Temperature: the steady-state temperature field as a heat map (thermal runs).
 *  - Stress: von Mises stress as a heat map, on the solved shape (structural runs).
 */

export type ViewMode = 'mesh' | 'temperature' | 'stress';

/* ------------------------------------------------------------------ */
/*  Colour maps                                                        */
/* ------------------------------------------------------------------ */

/** Thermal: deep blue (coolest) → cyan → yellow → orange → red → deep red (hottest). */
const HEAT: [number, number, number][] = [
  [0.12, 0.2, 0.55],
  [0.1, 0.55, 0.85],
  [0.45, 0.85, 0.75],
  [0.98, 0.88, 0.3],
  [0.97, 0.55, 0.12],
  [0.85, 0.15, 0.08],
  [0.5, 0.0, 0.06],
];
/** Turbo-like: blue → cyan → green → yellow → red. The usual stress-contour ramp. */
const STRESS: [number, number, number][] = [
  [0.19, 0.07, 0.23],
  [0.16, 0.47, 0.94],
  [0.1, 0.81, 0.73],
  [0.55, 0.98, 0.29],
  [0.98, 0.73, 0.21],
  [0.83, 0.2, 0.05],
  [0.48, 0.02, 0.01],
];

function sample(map: [number, number, number][], t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (map.length - 1);
  const i = Math.min(map.length - 2, Math.floor(x));
  const f = x - i;
  const a = map[i];
  const b = map[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

const cssGradient = (map: [number, number, number][]) =>
  `linear-gradient(to top, ${map.map((c, i) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')}) ${(i / (map.length - 1)) * 100}%`).join(', ')})`;

/* ------------------------------------------------------------------ */
/*  Geometry prepared once per payload                                 */
/* ------------------------------------------------------------------ */

interface Prepared {
  /** Positions in scene units (model centred, longest side = 1). */
  base: Float32Array;
  index: Uint32Array;
  disp: Float32Array | null;
  /** Scene units per metre. */
  k: number;
  /** Model extents, mm. */
  sizeMm: [number, number, number];
  centerM: THREE.Vector3;
  temperatureC: Float32Array | null;
  stressMPa: Float32Array | null;
}

function prepare(p: VisualizationPayload): Prepared {
  const n = p.nodes.length;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const q of p.nodes) box.expandByPoint(v.set(q[0], q[1], q[2]));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const k = 1 / Math.max(size.x, size.y, size.z, 1e-9);
  const base = new Float32Array(n * 3);
  p.nodes.forEach((q, i) => {
    base[i * 3] = (q[0] - center.x) * k;
    base[i * 3 + 1] = (q[1] - center.y) * k;
    base[i * 3 + 2] = (q[2] - center.z) * k;
  });
  const index = new Uint32Array(p.faces.length * 3);
  p.faces.forEach((f, i) => index.set(f.slice(0, 3), i * 3));
  let disp: Float32Array | null = null;
  if (p.displacement) {
    disp = new Float32Array(n * 3);
    p.displacement.forEach((d, i) => disp!.set([d[0] * k, d[1] * k, d[2] * k], i * 3));
  }
  return {
    base,
    index,
    disp,
    k,
    sizeMm: [size.x * 1000, size.y * 1000, size.z * 1000],
    centerM: center,
    temperatureC: p.temperature ? Float32Array.from(p.temperature, (t) => t - 273.15) : null,
    stressMPa: p.von_mises ? Float32Array.from(p.von_mises, (s) => s / 1e6) : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Mesh structure: each surface face as its own chunk                 */
/* ------------------------------------------------------------------ */

function ChunkMesh({ prep, gap }: { prep: Prepared; gap: number }) {
  const geom = useMemo(() => {
    const tris = prep.index.length / 3;
    const pos = new Float32Array(tris * 9);
    const col = new Float32Array(tris * 9);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const m = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const shrink = 1 - gap;
    for (let t = 0; t < tris; t++) {
      a.fromArray(prep.base, prep.index[t * 3] * 3);
      b.fromArray(prep.base, prep.index[t * 3 + 1] * 3);
      c.fromArray(prep.base, prep.index[t * 3 + 2] * 3);
      m.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      [a, b, c].forEach((p, j) => {
        p.sub(m).multiplyScalar(shrink).add(m);
        pos.set([p.x, p.y, p.z], t * 9 + j * 3);
      });
      // Tint each chunk by which way it faces, so the faces of the shape read apart.
      nrm.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
      const tint = 0.78 + 0.12 * Math.abs(nrm.x) + 0.06 * Math.abs(nrm.y);
      const r = 0.58 * tint;
      const g = 0.68 * tint;
      const bl = 0.82 * tint;
      for (let j = 0; j < 3; j++) col.set([r, g, bl], t * 9 + j * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, [prep, gap]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geom, 1), [geom]);
  useEffect(() => () => {
    geom.dispose();
    edges.dispose();
  }, [geom, edges]);
  return (
    <group>
      <mesh geometry={geom}>
        <meshStandardMaterial vertexColors flatShading metalness={0.15} roughness={0.55} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#1e3a5f" transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
}

/** Bounding box with its three dimensions labelled in mm. */
function Dimensions({ prep }: { prep: Prepared }) {
  const [sx, sy, sz] = prep.sizeMm.map((v) => v * prep.k * 0.001);
  const box = useMemo(() => new THREE.Box3(new THREE.Vector3(-sx / 2, -sy / 2, -sz / 2), new THREE.Vector3(sx / 2, sy / 2, sz / 2)), [sx, sy, sz]);
  const label = (text: string, p: [number, number, number]) => (
    <Html position={p} center style={{ pointerEvents: 'none' }}>
      <div className="rv-dim">{text}</div>
    </Html>
  );
  const mm = (v: number) => `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} mm`;
  return (
    <group>
      <box3Helper args={[box, new THREE.Color('#64748b')]} />
      {label(`X ${mm(prep.sizeMm[0])}`, [0, -sy / 2, sz / 2])}
      {label(`Y ${mm(prep.sizeMm[1])}`, [sx / 2, 0, sz / 2])}
      {label(`Z ${mm(prep.sizeMm[2])}`, [sx / 2, -sy / 2, 0])}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Field heat map                                                     */
/* ------------------------------------------------------------------ */

interface Hover {
  value: number;
  node: number;
}

function FieldMesh({
  prep,
  values,
  range,
  map,
  deform,
  animate,
  onHover,
}: {
  prep: Prepared;
  values: Float32Array;
  range: [number, number];
  map: [number, number, number][];
  /** Displacement scale (0 = undeformed). */
  deform: number;
  animate: boolean;
  onHover: (h: Hover | null) => void;
}) {
  // One vertex per triangle corner, so every face gets its own normal. The solver's
  // surface triangles aren't consistently wound, and smooth normals averaged over
  // them cancel out into dark blotches. Colours still come from each corner's node,
  // so the field blends smoothly across faces.
  const corners = prep.index;
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(corners.length * 3);
    for (let i = 0; i < corners.length; i++) pos.set(prep.base.subarray(corners[i] * 3, corners[i] * 3 + 3), i * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }, [prep, corners]);
  useEffect(() => () => geom.dispose(), [geom]);

  useEffect(() => {
    const [lo, hi] = range;
    const span = hi - lo || 1;
    const col = new Float32Array(corners.length * 3);
    for (let i = 0; i < corners.length; i++) col.set(sample(map, (values[corners[i]] - lo) / span), i * 3);
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }, [geom, corners, values, range[0], range[1], map]); // the range numbers, not the array (a new one each render)

  // Displacement: the solved shape times the stated scale, optionally ramped from zero.
  const clock = useRef(0);
  const lastS = useRef(-1);
  useFrame((_, dt) => {
    if (!prep.disp) return;
    clock.current = (clock.current + dt) % 3;
    const ramp = animate ? Math.min(1, clock.current / 1.5) : 1;
    const s = deform * ramp;
    if (s === lastS.current) return;
    lastS.current = s;
    const pos = geom.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < corners.length; i++) {
      const n = corners[i] * 3;
      arr[i * 3] = prep.base[n] + prep.disp[n] * s;
      arr[i * 3 + 1] = prep.base[n + 1] + prep.disp[n + 1] * s;
      arr[i * 3 + 2] = prep.base[n + 2] + prep.disp[n + 2] * s;
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  });

  const move = (e: ThreeEvent<PointerEvent>) => {
    if (e.faceIndex === undefined || e.faceIndex === null) return;
    const pos = geom.getAttribute('position');
    const local = e.object.worldToLocal(e.point.clone());
    let best = corners[e.faceIndex * 3];
    let bd = Infinity;
    for (let j = 0; j < 3; j++) {
      const c = e.faceIndex * 3 + j;
      const d = local.distanceToSquared(new THREE.Vector3().fromBufferAttribute(pos, c));
      if (d < bd) {
        bd = d;
        best = corners[c];
      }
    }
    onHover({ value: values[best], node: best });
  };

  return (
    <mesh geometry={geom} onPointerMove={move} onPointerOut={() => onHover(null)}>
      <meshStandardMaterial vertexColors metalness={0.05} roughness={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

function PeakMarker({ p, text }: { p: THREE.Vector3; text: string }) {
  return (
    <group position={p}>
      <mesh>
        <sphereGeometry args={[0.012, 16, 12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <Html center style={{ pointerEvents: 'none' }}>
        <div className="rv-peak">{text}</div>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Viewer                                                             */
/* ------------------------------------------------------------------ */

const HOME: CameraPreset = { pos: new THREE.Vector3(1.25, 0.85, 1.55), target: new THREE.Vector3(0, 0, 0) };

export function ResultViewer({ candidateId, title }: { candidateId: string; title?: string }) {
  const [payload, setPayload] = useState<VisualizationPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('mesh');
  const [gap, setGap] = useState(0.18);
  const [showDims, setShowDims] = useState(true);
  const [deformOn, setDeformOn] = useState(true);
  const [animate, setAnimate] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [goal, setGoal] = useState<CameraPreset>(HOME);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setPayload(null);
    setError(null);
    setHover(null);
    api
      .visualization(candidateId)
      .then((p) => {
        if (!live) return;
        setPayload(p);
        // Open on the field the solver computed, else on the mesh.
        setMode(p.temperature ? 'temperature' : p.von_mises ? 'stress' : 'mesh');
        setGoal(HOME);
        setNonce((n) => n + 1);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [candidateId]);

  const prep = useMemo(() => (payload ? prepare(payload) : null), [payload]);

  if (error) return <div className="note amber">Could not load this result: {error}</div>;
  if (!payload || !prep) return <div className="rv-loading hint">Loading the solver result…</div>;

  const isThermal = !!prep.temperatureC;
  const isStructural = !!prep.stressMPa;
  const field =
    mode === 'temperature' && prep.temperatureC
      ? { values: prep.temperatureC, unit: '°C', label: 'Temperature', map: HEAT, digits: 0 }
      : mode === 'stress' && prep.stressMPa
        ? { values: prep.stressMPa, unit: 'MPa', label: 'von Mises stress', map: STRESS, digits: 1 }
        : null;
  const range: [number, number] | null = field ? [Math.min(...field.values), Math.max(...field.values)] : null;
  const peakIdx = field ? field.values.indexOf(range![1]) : -1;
  const deform = mode === 'stress' && deformOn && prep.disp ? payload.recommended_deformation_scale : 0;
  const peakPos =
    peakIdx >= 0
      ? new THREE.Vector3(
          prep.base[peakIdx * 3] + (prep.disp ? prep.disp[peakIdx * 3] * deform : 0),
          prep.base[peakIdx * 3 + 1] + (prep.disp ? prep.disp[peakIdx * 3 + 1] * deform : 0),
          prep.base[peakIdx * 3 + 2] + (prep.disp ? prep.disp[peakIdx * 3 + 2] * deform : 0),
        )
      : null;
  const fmtV = (v: number) => `${v.toFixed(field?.digits ?? 0)} ${field?.unit ?? ''}`;
  const zoomPeak = () => {
    if (!peakPos) return;
    const dir = peakPos.clone().normalize();
    if (dir.lengthSq() < 1e-6) dir.set(1, 0.6, 1).normalize();
    setGoal({ pos: peakPos.clone().add(dir.multiplyScalar(0.45)).add(new THREE.Vector3(0, 0.12, 0)), target: peakPos.clone() });
    setNonce((n) => n + 1);
  };
  const home = () => {
    setGoal(HOME);
    setNonce((n) => n + 1);
  };
  const nodeMm = (i: number) => {
    const q = payload.nodes[i];
    return q.map((v) => (v * 1000).toFixed(1)).join(', ');
  };

  const modes: { id: ViewMode; label: string; ok: boolean; why?: string }[] = [
    { id: 'mesh', label: 'Mesh structure', ok: true },
    {
      id: 'temperature',
      label: 'Temperature',
      ok: isThermal,
      why: 'This is a structural run: the solver computed stress and displacement, not temperature. Temperature maps come from thermal runs (e.g. the spark plug).',
    },
    {
      id: 'stress',
      label: 'Stress',
      ok: isStructural,
      why: 'This is a thermal run: there is no stress field. Stress maps come from structural runs (caliper, wheel).',
    },
  ];

  return (
    <div className="rv">
      <div className="rv-modes" role="tablist" aria-label="Result view">
        {modes.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            className={`vp-btn ${mode === m.id ? 'active' : ''}`}
            disabled={!m.ok}
            title={m.ok ? undefined : m.why}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
        {title && <span className="rv-title">{title}</span>}
      </div>

      <div className="rv-canvas">
        <Canvas camera={{ position: HOME.pos.toArray(), fov: 35, near: 0.005, far: 50 }} dpr={[1, 2]} gl={{ antialias: true }}>
          <ThemeBackground />
          <StudioEnvironment />
          <ambientLight intensity={0.5} />
          <directionalLight position={[2, 3, 2]} intensity={1.6} />
          <directionalLight position={[-2, 1, -1.5]} intensity={0.6} color="#9cc3ff" />
          {mode === 'mesh' ? (
            <>
              <ChunkMesh prep={prep} gap={gap} />
              {showDims && <Dimensions prep={prep} />}
            </>
          ) : field && range ? (
            <>
              <FieldMesh prep={prep} values={field.values} range={range} map={field.map} deform={deform} animate={animate} onHover={setHover} />
              {peakPos && <PeakMarker p={peakPos} text={`max ${fmtV(range[1])}`} />}
            </>
          ) : null}
          <OrbitControls makeDefault enableDamping dampingFactor={0.1} minDistance={0.15} maxDistance={6} />
          <CameraRig goal={goal} nonce={nonce} />
        </Canvas>

        {field && range && (
          <div className="rv-legend" aria-label={`${field.label} colour scale`}>
            <div className="rv-legend-title">{field.label}</div>
            <div className="rv-legend-body">
              <div className="rv-bar" style={{ background: cssGradient(field.map) }} />
              <div className="rv-ticks">
                {[1, 0.75, 0.5, 0.25, 0].map((f) => (
                  <span key={f}>{fmtV(range[0] + (range[1] - range[0]) * f)}</span>
                ))}
              </div>
            </div>
          </div>
        )}
        {field && hover && (
          <div className="rv-hover">
            <b>{fmtV(hover.value)}</b>
            <span>node {hover.node} · ({nodeMm(hover.node)}) mm</span>
          </div>
        )}
        {mode === 'mesh' && (
          <div className="rv-stats">
            <span>
              {prep.sizeMm.map((v) => v.toFixed(1)).join(' × ')} mm
            </span>
            <span>{payload.node_count.toLocaleString()} nodes</span>
            <span>{payload.triangle_count.toLocaleString()} surface faces</span>
          </div>
        )}
      </div>

      <div className="rv-controls">
        {mode === 'mesh' && (
          <>
            <label className="rv-slider">
              Chunk gap
              <input type="range" min={0} max={0.45} step={0.01} value={gap} onChange={(e) => setGap(Number(e.target.value))} style={{ ['--fill' as string]: `${(gap / 0.45) * 100}%` }} />
            </label>
            <button className={`vp-btn ${showDims ? 'active' : ''}`} aria-pressed={showDims} onClick={() => setShowDims(!showDims)}>
              Dimensions
            </button>
          </>
        )}
        {field && (
          <button className="vp-btn" onClick={zoomPeak}>
            ⌖ Zoom to {mode === 'temperature' ? 'hottest point' : 'peak stress'}
          </button>
        )}
        {mode === 'stress' && prep.disp && (
          <>
            <button className={`vp-btn ${deformOn ? 'active' : ''}`} aria-pressed={deformOn} onClick={() => setDeformOn(!deformOn)}>
              Deformed ×{payload.recommended_deformation_scale}
            </button>
            <button className={`vp-btn ${animate ? 'active' : ''}`} aria-pressed={animate} disabled={!deformOn} onClick={() => setAnimate(!animate)}>
              Ramp 0 → result
            </button>
          </>
        )}
        <button className="vp-btn rv-home" onClick={home}>
          ↺ Fit model
        </button>
      </div>

      <div className="hint rv-note">
        {mode === 'mesh'
          ? 'Each chunk is one boundary face of the finite-element mesh the solver used (its tetrahedra drawn straight-sided); the gap only separates them visually. Dimensions are the bounding box of that mesh.'
          : payload.visualization_note}{' '}
        {field && <>Values are {mode === 'temperature' ? payload.temperature_location : payload.stress_location} results from the solver.</>}
      </div>
    </div>
  );
}
