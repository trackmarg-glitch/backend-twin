/** The finite-element result viewport.
 *
 * Shows the solver's own boundary mesh coloured by its computed field. The
 * deformation exaggeration is always stated with the true maximum beside it,
 * and the load ramp is labelled as a visualisation of one static solution
 * rather than a transient analysis. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import { colorMapGradient } from './colormap';
import { ResultMesh, UndeformedGhost } from './ResultMesh';
import { fmt } from '../components/primitives';

type Field = 'none' | 'stress' | 'temperature';

function FitCamera({ fitKey }: { fitKey: string }) {
  const { camera, scene, controls } = useThree();
  useEffect(() => {
    const timer = setTimeout(() => {
      const box = new THREE.Box3();
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry) {
          mesh.geometry.computeBoundingBox();
          if (mesh.geometry.boundingBox) {
            box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
          }
        }
      });
      if (box.isEmpty()) return;
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z) * 0.5 || 0.1;
      const perspective = camera as THREE.PerspectiveCamera;
      const distance = (radius / Math.sin((perspective.fov * Math.PI) / 360)) * 1.45;
      camera.position.copy(
        centre.clone().add(new THREE.Vector3(0.75, 0.5, 1).normalize().multiplyScalar(distance)),
      );
      perspective.near = Math.max(distance / 500, 1e-4);
      perspective.far = distance * 50;
      perspective.updateProjectionMatrix();
      camera.lookAt(centre);
      const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void };
      if (orbit?.target) {
        orbit.target.copy(centre);
        orbit.update?.();
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [camera, scene, controls, fitKey]);
  return null;
}

function RampDriver({ animating, onPhase }: { animating: boolean; onPhase: (p: number) => void }) {
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    if (!animating) return;
    elapsed.current += delta;
    const t = (elapsed.current % 2.6) / 2.6;
    const eased = t < 0.55 ? t / 0.55 : 1;
    onPhase(0.5 - 0.5 * Math.cos(Math.PI * Math.min(eased, 1)));
  });
  useEffect(() => {
    if (!animating) onPhase(1);
    else elapsed.current = 0;
  }, [animating, onPhase]);
  return null;
}

export function ResultViewport({ height = 420 }: { height?: number }) {
  const payload = useStore((s) => s.visualization);
  const candidate = useStore((s) => s.selectedCandidate());

  const [field, setField] = useState<Field>('none');
  const [wireframe, setWireframe] = useState(false);
  const [ghost, setGhost] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [phase, setPhase] = useState(1);
  const [scaleOverride, setScaleOverride] = useState<number | null>(null);

  // Default to whichever field this result actually carries.
  useEffect(() => {
    if (!payload) return;
    setField(payload.temperature ? 'temperature' : payload.von_mises ? 'stress' : 'none');
    setScaleOverride(null);
    setPhase(1);
  }, [payload?.candidate_id]);

  const scale = scaleOverride ?? payload?.recommended_deformation_scale ?? 1;
  const colourMap = field === 'temperature' ? 'inferno' : 'viridis';

  const legend = useMemo(() => {
    if (!payload) return null;
    if (field === 'stress' && payload.stress_range_pa) {
      const [min, max] = payload.stress_range_pa;
      return {
        title: 'von Mises stress',
        min: `${fmt(min / 1e6)} MPa`,
        max: `${fmt(max / 1e6)} MPa`,
        note:
          payload.stress_location === 'nodal_l2_projected'
            ? 'Nodal values, L2-projected from element stresses.'
            : `Field location: ${payload.stress_location ?? 'unknown'}.`,
      };
    }
    if (field === 'temperature' && payload.temperature_range_k) {
      const [min, max] = payload.temperature_range_k;
      return {
        title: 'Steady-state temperature',
        min: `${fmt(min - 273.15)} °C`,
        max: `${fmt(max - 273.15)} °C`,
        note: 'Nodal temperature field. Steady state, not a transient simulation.',
      };
    }
    return null;
  }, [payload, field]);

  if (!payload) {
    return (
      <div
        className="viewport"
        style={{ height, display: 'grid', placeItems: 'center', minHeight: height }}
      >
        <div className="empty" style={{ padding: 20 }}>
          {candidate && !candidate.evaluated ? (
            <>
              <div style={{ color: 'var(--fail)', marginBottom: 6 }}>
                This candidate produced no result
              </div>
              <div className="small">
                Failed at the {candidate.failure_stage} stage. Nothing was computed, so
                there is no field to display.
              </div>
            </>
          ) : (
            'No computed field loaded.'
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="viewport" style={{ height, minHeight: height }}>
      <Canvas
        camera={{ position: [0.4, 0.3, 0.5], fov: 42, near: 1e-4, far: 100 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#05080e']} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[1, 2, 2]} intensity={1.5} />
        <directionalLight position={[-2, -1, -1]} intensity={0.45} />
        <hemisphereLight args={['#3d6185', '#05080e', 0.5]} />

        {ghost && payload.displacement && <UndeformedGhost payload={payload} />}
        <ResultMesh
          payload={payload}
          colorField={field}
          deformationScale={scale}
          phase={phase}
          wireframe={wireframe}
          colorMap={colourMap}
        />

        <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
        <FitCamera fitKey={payload.candidate_id} />
        <RampDriver animating={animating} onPhase={setPhase} />
      </Canvas>

      <div className="viewport-views" style={{ flexWrap: 'wrap', maxWidth: '85%' }}>
        <button
          className={`btn btn-sm ${field === 'none' ? 'btn-primary' : ''}`}
          onClick={() => setField('none')}
        >
          Shape
        </button>
        {payload.von_mises && (
          <button
            className={`btn btn-sm ${field === 'stress' ? 'btn-primary' : ''}`}
            onClick={() => setField('stress')}
          >
            Stress
          </button>
        )}
        {payload.temperature && (
          <button
            className={`btn btn-sm ${field === 'temperature' ? 'btn-primary' : ''}`}
            onClick={() => setField('temperature')}
          >
            Temperature
          </button>
        )}
        <button
          className={`btn btn-sm ${wireframe ? 'btn-primary' : ''}`}
          onClick={() => setWireframe((v) => !v)}
        >
          Mesh
        </button>
        {payload.displacement && (
          <>
            <button
              className={`btn btn-sm ${animating ? 'btn-primary' : ''}`}
              onClick={() => setAnimating((v) => !v)}
            >
              {animating ? '■ Stop ramp' : '▶ Load ramp'}
            </button>
            <button
              className={`btn btn-sm ${ghost ? 'btn-primary' : ''}`}
              onClick={() => setGhost((v) => !v)}
            >
              Undeformed
            </button>
          </>
        )}
      </div>

      {legend && (
        <div className="viewport-overlay" style={{ top: 'auto', bottom: 52, maxWidth: 230 }}>
          <div className="viewport-overlay-title">{legend.title}</div>
          <div
            style={{
              height: 9,
              borderRadius: 2,
              margin: '6px 0 4px',
              background: colorMapGradient(colourMap),
            }}
          />
          <div className="row-between mono tiny dim">
            <span>{legend.min}</span>
            <span>{legend.max}</span>
          </div>
          <div className="viewport-overlay-line" style={{ marginTop: 5 }}>
            {legend.note}
          </div>
        </div>
      )}

      {payload.displacement && (
        <div className="viewport-crank" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="tiny faint">deform ×</span>
          <input
            type="range"
            min={1}
            max={Math.max(2000, (payload.recommended_deformation_scale ?? 1) * 3)}
            step={1}
            value={scale}
            onChange={(e) => setScaleOverride(Number(e.target.value))}
            style={{ width: 80, margin: 0 }}
          />
          <strong className="mono">{scale.toFixed(0)}×</strong>
        </div>
      )}

      {payload.visualization_note && (
        <div
          className="viewport-alias"
          style={{
            background: 'rgba(10,16,26,0.9)',
            borderColor: 'var(--border)',
            color: 'var(--text-dim)',
            bottom: 'auto',
            top: 11,
            left: 11,
            right: 'auto',
            maxWidth: 340,
          }}
        >
          <strong style={{ color: 'var(--warn)' }}>What you are looking at</strong>
          <div style={{ marginTop: 3 }}>
            {scaleOverride !== null && payload.max_displacement_m
              ? `Displacement is exaggerated ${scale.toFixed(0)}× for display. The computed ` +
                `maximum is ${(payload.max_displacement_m * 1000).toFixed(4)} mm. The ramp ` +
                `visualises one linear static solution, not a transient analysis.`
              : payload.visualization_note}
          </div>
        </div>
      )}
    </div>
  );
}
