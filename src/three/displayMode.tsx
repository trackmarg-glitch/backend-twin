/**
 * Display modes for a Digital Twin viewport, applied on top of whatever the
 * scene draws:
 *
 *  - solid:       the twin as it is.
 *  - mesh:        every part drawn flat-shaded with its triangle edges, so the
 *                 shape, its structure and its tessellation are clear. This is
 *                 the twin's display geometry, not a finite-element mesh.
 *  - temperature: parts the twin has a temperature for are coloured on a heat
 *                 scale, live; everything else turns neutral grey.
 *
 * Mount <SceneDisplay mode heat /> inside the <Canvas>. It swaps materials per
 * mesh each frame and restores the originals when the mode returns to solid or
 * the component unmounts, so the twin's own code needs no changes.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type DisplayMode = 'solid' | 'mesh' | 'temperature';

export interface HeatSource {
  /** Temperature in °C for a mesh (identified by its original material), or null if the twin has none for it. */
  tempOf: (original: THREE.Material, mesh: THREE.Mesh) => number | null;
  /** Colour-scale end points, °C. */
  range: [number, number];
}

/** Deep blue (cool) → cyan → yellow → orange → red → deep red (hot). Same scale as the solver result viewer. */
export const HEAT_STOPS: [number, number, number][] = [
  [0.12, 0.2, 0.55],
  [0.1, 0.55, 0.85],
  [0.45, 0.85, 0.75],
  [0.98, 0.88, 0.3],
  [0.97, 0.55, 0.12],
  [0.85, 0.15, 0.08],
  [0.5, 0.0, 0.06],
];

export function heatColour(t: number, out = new THREE.Color()) {
  const x = Math.min(1, Math.max(0, t)) * (HEAT_STOPS.length - 1);
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = HEAT_STOPS[i];
  const b = HEAT_STOPS[i + 1];
  return out.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

export const HEAT_GRADIENT_CSS = `linear-gradient(to right, ${HEAT_STOPS.map(
  (c, i) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')}) ${(i / (HEAT_STOPS.length - 1)) * 100}%`,
).join(', ')})`;

const ORIG = '__displayOrig';
const WIRE = '__displayWire';

type Tagged = THREE.Mesh & { userData: { [ORIG]?: THREE.Material | THREE.Material[] } };

function firstMat(m: THREE.Material | THREE.Material[]) {
  return Array.isArray(m) ? m[0] : m;
}

/**
 * Carry a part's shader patch (onBeforeCompile, e.g. a twin that bends its tyre
 * in the vertex shader) over to the replacement material, so Mesh and
 * Temperature modes show the same shape as Solid.
 */
function carryPatch(src: THREE.Material, dst: THREE.Material) {
  if (dst.onBeforeCompile !== src.onBeforeCompile) {
    dst.onBeforeCompile = src.onBeforeCompile;
    dst.customProgramCacheKey = src.customProgramCacheKey;
    dst.needsUpdate = true;
  }
}

export function SceneDisplay({ mode, heat }: { mode: DisplayMode; heat?: HeatSource }) {
  const { scene } = useThree();
  const chunkMats = useRef(new Map<THREE.Material, THREE.MeshStandardMaterial>());
  const heatMats = useRef(new Map<THREE.Material, THREE.MeshStandardMaterial>());
  const grey = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#b8c0cc', metalness: 0.1, roughness: 0.75, transparent: true, opacity: 0.55 }),
    [],
  );
  const wireMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#0f2a44', transparent: true, opacity: 0.28 }), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  const restore = () => {
    scene.traverse((o) => {
      const mesh = o as Tagged;
      if (mesh.userData?.[ORIG]) {
        mesh.material = mesh.userData[ORIG]!;
        delete mesh.userData[ORIG];
      }
      const wire = o.getObjectByName(WIRE);
      if (wire && wire.parent === o) {
        o.remove(wire);
        (wire as THREE.LineSegments).geometry.dispose();
      }
    });
  };

  // Back to the original materials when leaving a mode or unmounting.
  useEffect(() => {
    if (mode === 'solid') restore();
    return () => restore();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      chunkMats.current.forEach((m) => m.dispose());
      heatMats.current.forEach((m) => m.dispose());
      grey.dispose();
      wireMat.dispose();
    },
    [grey, wireMat],
  );

  useFrame(() => {
    if (mode === 'solid') return;
    const meshes: Tagged[] = [];
    scene.traverse((o) => {
      const mesh = o as Tagged;
      if (mesh.isMesh) meshes.push(mesh);
    });
    for (const mesh of meshes) {
      // A part can opt out entirely (e.g. a twin's own result overlay): userData.keepDisplay = true.
      if (mesh.userData.keepDisplay) continue;
      const orig = (mesh.userData[ORIG] ??= mesh.material);
      const base = firstMat(orig);
      // Skip glow sprites, overlays and anything already see-through and unlit.
      if (!(base as THREE.MeshStandardMaterial).isMeshStandardMaterial && !(base as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
        continue;
      }
      const src = base as THREE.MeshStandardMaterial;

      if (mode === 'mesh') {
        let m = chunkMats.current.get(src);
        if (!m) {
          m = new THREE.MeshStandardMaterial({ flatShading: true, metalness: 0.1, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
          chunkMats.current.set(src, m);
        }
        // Keep the part's own hue, lightened, so parts stay recognisable.
        m.color.copy(src.color).lerp(tmp.set('#ffffff'), 0.35);
        m.side = src.side;
        m.clippingPlanes = src.clippingPlanes;
        m.transparent = src.transparent;
        m.opacity = src.opacity;
        carryPatch(src, m);
        mesh.material = m;
        let wire = mesh.getObjectByName(WIRE) as THREE.LineSegments | undefined;
        if (wire && wire.parent === mesh && wire.userData.geom !== mesh.geometry) {
          mesh.remove(wire);
          wire.geometry.dispose();
          wire = undefined;
        }
        // An edge overlay on an instanced mesh would only draw one copy, at the origin: skip it.
        if ((!wire || wire.parent !== mesh) && !(mesh as unknown as THREE.InstancedMesh).isInstancedMesh) {
          wire = new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry), wireMat);
          wire.name = WIRE;
          wire.userData.geom = mesh.geometry;
          wire.raycast = () => {};
          mesh.add(wire);
        }
        wireMat.clippingPlanes = src.clippingPlanes;
        continue;
      }

      // temperature
      const wire = mesh.getObjectByName(WIRE);
      if (wire && wire.parent === mesh) {
        mesh.remove(wire);
        (wire as THREE.LineSegments).geometry.dispose();
      }
      const t = heat?.tempOf(src, mesh) ?? null;
      if (t === null) {
        // A shader-patched part keeps its patch: give it its own grey copy.
        let g = grey;
        if (src.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
          g = heatMats.current.get(src) ?? grey.clone();
          heatMats.current.set(src, g);
          carryPatch(src, g);
        }
        g.clippingPlanes = src.clippingPlanes;
        g.side = src.side;
        mesh.material = g;
        continue;
      }
      let m = heatMats.current.get(src);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.55 });
        heatMats.current.set(src, m);
      }
      const [lo, hi] = heat!.range;
      const f = (t - lo) / (hi - lo || 1);
      heatColour(f, m.color);
      // Hot parts glow a little, the way hot metal does.
      m.emissive.copy(m.color);
      m.emissiveIntensity = 0.15 + 0.55 * Math.min(1, Math.max(0, f));
      m.side = src.side;
      m.clippingPlanes = src.clippingPlanes;
      carryPatch(src, m);
      mesh.material = m;
    }
  });

  return null;
}

/** A Solid | Mesh | Temperature switch for a viewport toolbar. */
export function DisplayModeButtons({
  mode,
  onChange,
  temperatureTitle,
  modes = ['solid', 'mesh', 'temperature'],
  disabled = {},
}: {
  mode: DisplayMode;
  onChange: (m: DisplayMode) => void;
  temperatureTitle?: string;
  /** Which modes to offer (e.g. a twin without a thermal model can leave out 'temperature'). */
  modes?: DisplayMode[];
  /** Modes shown but greyed out, with the reason as a tooltip. */
  disabled?: Partial<Record<DisplayMode, string>>;
}) {
  const opts: { id: DisplayMode; label: string; title?: string }[] = [
    { id: 'solid', label: 'Solid' },
    { id: 'mesh', label: 'Mesh', title: 'Every part drawn flat with its triangle edges: shape, structure and tessellation' },
    { id: 'temperature', label: 'Temperature', title: temperatureTitle },
  ];
  return (
    <>
      {opts.filter((o) => modes.includes(o.id)).map((o) => (
        <button
          key={o.id}
          className={`vp-btn ${mode === o.id ? 'active' : ''}`}
          aria-pressed={mode === o.id}
          title={disabled[o.id] ?? o.title}
          disabled={!!disabled[o.id]}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </>
  );
}

/** Horizontal heat scale for the viewport legend, with optional markers for current values. */
export function HeatLegend({ range, marks = [], caption }: { range: [number, number]; marks?: { label: string; value: number }[]; caption: string }) {
  const [lo, hi] = range;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo || 1)) * 100))}%`;
  return (
    <div className="vp-legend dm-legend" aria-label={caption}>
      <span>{lo} °C</span>
      <span className="dm-bar" style={{ background: HEAT_GRADIENT_CSS }}>
        {marks.map((m, i) => (
          // Every other label goes under the bar, so two close values don't overlap.
          <i key={m.label} className={`dm-mark ${i % 2 ? 'below' : ''}`} style={{ left: pos(m.value) }} title={`${m.label}: ${m.value.toFixed(0)} °C`}>
            <b>
              {m.label} {m.value.toFixed(0)}°
            </b>
          </i>
        ))}
      </span>
      <span>{hi} °C</span>
      <span className="dm-cap">{caption}</span>
    </div>
  );
}
