/** The component viewport.
 *
 * One viewport, three animations, chosen by the component under study. Each one
 * is built from the live design parameters, so what moves on screen is the
 * design being edited — not a stand-in.
 *
 * Shared across all three: camera presets, an overlay that states what is real
 * and what is illustrative context, and a warning when the animation is
 * sampling too coarsely to be read literally. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import { EngineScene, type PlugGeometry } from './EngineScene';
import {
  REFERENCE_ENGINE,
  crankDegreesPerFrame,
  engineState,
  tipColour,
} from './kinematics';
import { WheelScene } from './WheelScene';
import type { WheelGeometry } from './wheelKinematics';
import {
  CONTACT_HALF_ANGLE,
  spokeStates,
  wheelDegreesPerSecond,
  wheelRpm,
} from './wheelKinematics';
import { CaliperScene } from './CaliperScene';
import {
  type BrakeState,
  type CaliperGeometry,
  INITIAL_BRAKE_STATE,
  REFERENCE_DISC,
  brakePhaseLabel,
  stepBrake,
} from './brakeKinematics';
import type { ComponentType } from '../types/api';

type ViewPreset = {
  key: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
};

const VIEWS: Record<ComponentType, ViewPreset[]> = {
  spark_plug: [
    { key: 'cutaway', label: 'Engine cutaway', position: [0.30, 0.17, 0.42], target: [0, 0.03, 0], fov: 42 },
    { key: 'side', label: 'Slider-crank side', position: [0.02, 0.05, 0.46], target: [0, 0.02, 0], fov: 38 },
    { key: 'tips', label: 'Spark-plug tips', position: [0, 0.175, 0.23], target: [0, 0.145, 0], fov: 34 },
  ],
  alloy_wheel: [
    { key: 'road', label: 'Road contact', position: [0.42, 0.10, 0.62], target: [0, -0.06, 0], fov: 40 },
    { key: 'face', label: 'Wheel face', position: [0, 0, 0.78], target: [0, 0, 0], fov: 38 },
    { key: 'spoke', label: 'Loaded spoke', position: [0.10, -0.20, 0.34], target: [0, -0.14, 0], fov: 36 },
  ],
  brake_caliper: [
    { key: 'assembly', label: 'Disc assembly', position: [0.34, 0.14, 0.40], target: [0, 0.03, 0], fov: 40 },
    { key: 'caliper', label: 'Caliper detail', position: [0.10, 0.16, 0.20], target: [0, 0.10, 0], fov: 34 },
    { key: 'mouth', label: 'Mouth opening', position: [0.24, 0.12, 0.04], target: [0, 0.10, 0], fov: 32 },
  ],
};

/* ------------------------------------------------------- camera control */

function ViewController({ preset, nonce }: { preset: ViewPreset; nonce: number }) {
  const { camera, controls } = useThree();
  const target = useRef(new THREE.Vector3());
  const position = useRef(new THREE.Vector3());
  const animating = useRef(false);

  useEffect(() => {
    position.current.set(...preset.position);
    target.current.set(...preset.target);
    animating.current = true;
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.fov = preset.fov;
    perspective.near = 0.005;
    perspective.far = 30;
    perspective.updateProjectionMatrix();
  }, [preset, nonce, camera]);

  useFrame(() => {
    if (!animating.current) return;
    camera.position.lerp(position.current, 0.12);
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void };
    if (orbit?.target) {
      orbit.target.lerp(target.current, 0.12);
      orbit.update?.();
    }
    if (camera.position.distanceTo(position.current) < 0.002) animating.current = false;
  });

  return null;
}

/* ------------------------------------------------------------- drivers */

function EngineDriver({
  running, rpm, timeScale, onTick,
}: {
  running: boolean;
  rpm: number;
  timeScale: number;
  onTick: (crankDeg: number, degreesPerFrame: number) => void;
}) {
  const angle = useRef(0);
  useFrame((_, delta) => {
    if (!running) return onTick(angle.current, 0);
    const step = crankDegreesPerFrame(rpm, timeScale, Math.min(delta, 0.1));
    angle.current = (angle.current + step) % 720;
    onTick(angle.current, step);
  });
  return null;
}

function WheelDriver({
  running, speedKph, rollingRadius, timeScale, onTick,
}: {
  running: boolean;
  speedKph: number;
  rollingRadius: number;
  timeScale: number;
  onTick: (rotationDeg: number, degreesPerFrame: number) => void;
}) {
  const angle = useRef(0);
  useFrame((_, delta) => {
    if (!running) return onTick(angle.current, 0);
    const step =
      wheelDegreesPerSecond(speedKph, rollingRadius) * timeScale * Math.min(delta, 0.1);
    angle.current = (angle.current + step) % 360;
    onTick(angle.current, step);
  });
  return null;
}

function BrakeDriver({
  running, onTick, maxMouthOpening,
}: {
  running: boolean;
  onTick: (state: BrakeState) => void;
  maxMouthOpening: number;
}) {
  const state = useRef<BrakeState>({ ...INITIAL_BRAKE_STATE });
  useFrame((_, delta) => {
    if (!running) return onTick(state.current);
    state.current = stepBrake(state.current, Math.min(delta, 0.1), {
      cycleSeconds: 6,
      initialDiscRpm: 420,
      maxMouthOpening,
    });
    onTick(state.current);
  });
  return null;
}

/* ------------------------------------------------------------- viewport */

export function ComponentViewport({ height = 500 }: { height?: number }) {
  const store = useStore();
  const componentType = store.componentType;
  const parameters = store.parameters;

  const presets = (componentType ? VIEWS[componentType] : undefined) ?? VIEWS.spark_plug;
  const [viewKey, setViewKey] = useState(presets[0].key);
  const [resetNonce, setResetNonce] = useState(0);

  useEffect(() => setViewKey(presets[0].key), [componentType]);


  const preset = presets.find((p) => p.key === viewKey) ?? presets[0];

  const [crankDeg, setCrankDeg] = useState(0);
  const [wheelDeg, setWheelDeg] = useState(0);
  const [stepPerFrame, setStepPerFrame] = useState(0);
  const [brake, setBrake] = useState<BrakeState>({ ...INITIAL_BRAKE_STATE });

  // Throttle overlay updates; the scenes read their own values each frame.
  const latest = useRef({ crank: 0, wheel: 0, step: 0, brake: { ...INITIAL_BRAKE_STATE } });
  useEffect(() => {
    const id = setInterval(() => {
      setCrankDeg(latest.current.crank);
      setWheelDeg(latest.current.wheel);
      setStepPerFrame(latest.current.step);
      setBrake({ ...latest.current.brake });
    }, 100);
    return () => clearInterval(id);
  }, []);

  const tips = store.tipTemperatures();
  const tipColours = useMemo(
    () => ({
      A: tips.A === null ? '#6b7a8c' : tipColour(tips.A),
      B: tips.B === null ? '#6b7a8c' : tipColour(tips.B),
    }),
    [tips.A, tips.B],
  );

  const engineStates = useMemo(() => engineState(crankDeg, REFERENCE_ENGINE), [crankDeg]);

  /* ---- geometry read straight from the design parameters ---- */

  const wheelGeometry = useMemo<WheelGeometry>(
    () => ({
      rimDiameter: parameters.rim_diameter_m ?? 0.4318,
      rimWidth: parameters.rim_width_m ?? 0.1905,
      rimWallThickness: parameters.rim_wall_thickness_m ?? 0.008,
      hubDiameter: parameters.hub_pad_diameter_m ?? 0.16,
      boreDiameter: parameters.center_bore_diameter_m ?? 0.0666,
      boltCircleDiameter: parameters.bolt_circle_diameter_m ?? 0.112,
      boltHoleDiameter: parameters.bolt_hole_diameter_m ?? 0.014,
      boltCount: parameters.bolt_count ?? 5,
      spokeCount: parameters.spoke_count ?? 7,
      spokeRootWidth: parameters.spoke_root_width_m ?? 0.044,
      spokeTipWidth: parameters.spoke_tip_width_m ?? 0.03,
      spokeThickness: parameters.spoke_thickness_m ?? 0.016,
      spokeDish: parameters.spoke_dish_offset_m ?? 0.085,
      hubThickness: parameters.hub_thickness_m ?? 0.02,
    }),
    [parameters],
  );

  const plugGeometry = useMemo<PlugGeometry>(
    () => ({
      noseLength: parameters.insulator_nose_length_m ?? 0.0075,
      noseDiameter: parameters.insulator_diameter_m ?? 0.0062,
      electrodeDiameter: parameters.center_electrode_diameter_m ?? 0.0025,
      electrodeProtrusion: parameters.electrode_protrusion_m ?? 0.002,
      threadDiameter: parameters.thread_major_diameter_m ?? 0.014,
      shellLength: parameters.shell_length_m ?? 0.022,
    }),
    [parameters],
  );

  const caliperGeometry = useMemo<CaliperGeometry>(
    () => ({
      bodyLength: parameters.body_length_m ?? 0.13,
      discSlotWidth: parameters.disc_slot_width_m ?? 0.034,
      wallThickness: parameters.wall_thickness_m ?? 0.02,
      bridgeThickness: parameters.bridge_thickness_m ?? 0.02,
      bodyHeight: parameters.body_height_m ?? 0.095,
      slotDepthFraction: parameters.slot_depth_fraction ?? 0.62,
      ribCount: parameters.rib_count ?? 2,
      ribThickness: parameters.rib_thickness_m ?? 0.008,
      pistonBoreDiameter: parameters.piston_bore_diameter_m ?? 0.048,
      mountHoleDiameter: parameters.mount_hole_diameter_m ?? 0.012,
      mountHoleSpacing: parameters.mount_hole_spacing_m ?? 0.096,
    }),
    [parameters],
  );

  /* ---- solved values that drive the animation where they exist ---- */

  const solvedOpening = useMemo(() => {
    const baseline = store.baselineCandidate();
    const value = baseline?.metrics?.max_displacement_m;
    return typeof value === 'number' ? value : 0.0001;
  }, [store.study]);

  // A tenth of a millimetre is invisible at this scale, so the opening is
  // exaggerated. The factor and the true value are both stated on screen.
  const openingScale = 120;

  const rollingRadius = wheelGeometry.rimDiameter / 2 + 0.055;
  const speedKph = 90;

  const loadedSpokes = useMemo(
    () => spokeStates(wheelDeg, wheelGeometry.spokeCount).filter((s) => s.inContact).length,
    [wheelDeg, wheelGeometry.spokeCount],
  );

  const aliased =
    store.animating &&
    (componentType === 'spark_plug' ? stepPerFrame > 40 : stepPerFrame > 28);

  const overlay = (() => {
    if (componentType === 'spark_plug') {
      return {
        title: 'Split-plug A/B arrangement — one engine, identical operating conditions',
        lines: [
          <>
            Plug A: cyl 1 &amp; 4 · Plug B: cyl 2 &amp; 3 ·{' '}
            <span style={{ color: '#f0a93b' }}>■ A</span>{' '}
            <span style={{ color: '#38bdf8' }}>■ B</span>
          </>,
          `Illustrative inline-4, 2.0 L (86 × 86 mm, rod 143.5 mm) · firing 1-3-4-2 · plugs drawn ×1.6`,
          `Plug built from design B: nose ${(plugGeometry.noseLength * 1000).toFixed(1)} mm · insulator Ø${(plugGeometry.noseDiameter * 1000).toFixed(1)} mm · electrode Ø${(plugGeometry.electrodeDiameter * 1000).toFixed(2)} mm`,
        ],
        warn: 'Engine geometry is illustrative context. Plug tip colour comes from the solver.',
        readout: `θ ${crankDeg.toFixed(1)}° / 720 · ${store.rpm.toLocaleString()} rpm`,
      };
    }
    if (componentType === 'alloy_wheel') {
      return {
        title: 'Rolling road load — the wheel turns, the contact patch does not',
        lines: [
          `${wheelGeometry.spokeCount} spokes · ${(wheelGeometry.rimDiameter * 39.3701).toFixed(0)}″ rim · dish ${(wheelGeometry.spokeDish * 1000).toFixed(0)} mm`,
          `Contact patch ±${CONTACT_HALF_ANGLE}° at the bottom — the same sector the solver loads · ${loadedSpokes} spoke(s) carrying`,
        ],
        warn:
          'Each spoke is loaded once per revolution. Spoke highlight is a load indicator, not the computed stress field.',
        readout: `${wheelDeg.toFixed(0)}° · ${wheelRpm(speedKph, rollingRadius).toFixed(0)} rpm · ${speedKph} km/h`,
      };
    }
    return {
      title: 'Brake application — clamping load opens the caliper mouth',
      lines: [
        `${caliperGeometry.ribCount} bridge rib(s) · bridge ${(caliperGeometry.bridgeThickness * 1000).toFixed(0)} mm · wall ${(caliperGeometry.wallThickness * 1000).toFixed(0)} mm`,
        `Illustrative ${(REFERENCE_DISC.outerDiameter * 1000).toFixed(0)} mm disc · mouth opening drawn ×${openingScale}`,
      ],
      warn: `Disc, pads and deceleration are illustrative. Mouth opening is the solver's computed ${(solvedOpening * 1000).toFixed(4)} mm, exaggerated for visibility.`,
      readout: `${brakePhaseLabel(brake)} · ${(brake.pressureFraction * 100).toFixed(0)}% clamp`,
    };
  })();

  return (
    <div className="viewport" style={{ height }}>
      <Canvas
        camera={{ position: preset.position, fov: preset.fov, near: 0.005, far: 30 }}
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <color attach="background" args={['#05080e']} />
        <fog attach="fog" args={['#05080e', 0.9, 3.0]} />

        <ambientLight intensity={0.5} />
        <directionalLight position={[0.4, 0.8, 0.6]} intensity={1.7} color="#cfe3f5" />
        <directionalLight position={[-0.6, 0.2, -0.4]} intensity={0.6} color="#4a7fb5" />
        <hemisphereLight args={['#3d6185', '#05080e', 0.55]} />

        {componentType === 'spark_plug' && (
          <>
            <EngineScene
              crankDeg={crankDeg}
              states={engineStates}
              geometry={REFERENCE_ENGINE}
              tipColours={tipColours}
              plugScale={1.6}
              showBlock={viewKey !== 'tips'}
              plug={plugGeometry}
            />
            <EngineDriver
              running={store.animating}
              rpm={store.rpm}
              timeScale={store.timeScale}
              onTick={(crank, step) => {
                latest.current.crank = crank;
                latest.current.step = step;
              }}
            />
          </>
        )}

        {componentType === 'alloy_wheel' && (
          <>
            <WheelScene geometry={wheelGeometry} rotationDeg={wheelDeg} />
            <WheelDriver
              running={store.animating}
              speedKph={speedKph}
              rollingRadius={rollingRadius}
              timeScale={store.timeScale * 12}
              onTick={(rotation, step) => {
                latest.current.wheel = rotation;
                latest.current.step = step;
              }}
            />
          </>
        )}

        {componentType === 'brake_caliper' && (
          <>
            <CaliperScene
              geometry={caliperGeometry}
              brake={brake}
              openingScale={openingScale}
            />
            <BrakeDriver
              running={store.animating}
              maxMouthOpening={solvedOpening}
              onTick={(state) => {
                latest.current.brake = state;
                latest.current.step = 0;
              }}
            />
          </>
        )}

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={0.1}
          maxDistance={3}
        />
        <ViewController preset={preset} nonce={resetNonce} />

        <EffectComposer>
          <Bloom intensity={0.8} luminanceThreshold={0.45} luminanceSmoothing={0.3} mipmapBlur />
        </EffectComposer>
      </Canvas>

      <div className="viewport-overlay">
        <div className="viewport-overlay-title">{overlay.title}</div>
        {overlay.lines.map((line, i) => (
          <div className="viewport-overlay-line" key={i}>
            {line}
          </div>
        ))}
        <div className="viewport-overlay-line" style={{ color: 'var(--warn)' }}>
          {overlay.warn}
        </div>
      </div>

      <div className="viewport-crank">{overlay.readout}</div>

      {componentType === 'spark_plug' && viewKey !== 'tips' && (
        <div className="cyl-labels">
          {engineStates.map((state) => (
            <div key={state.index} className={`cyl-label ${state.design === 'A' ? 'a' : 'b'}`}>
              <div
                className="cyl-label-top"
                style={{ color: state.design === 'A' ? '#f0a93b' : '#38bdf8' }}
              >
                CYL {state.number} · PLUG {state.design}
              </div>
              <div className="cyl-label-stroke">{state.stroke}</div>
            </div>
          ))}
        </div>
      )}

      {componentType === 'brake_caliper' && (
        <div className="legend-strip">
          <span>
            <span className="legend-swatch" style={{ background: '#f0a93b' }} />
            clamp {(brake.pressureFraction * 100).toFixed(0)}%
          </span>
          <span>
            <span className="legend-swatch" style={{ background: '#ef4444' }} />
            rubbing band +{brake.temperatureRise.toFixed(0)} K
          </span>
          <span>disc {(brake.speedFraction * 100).toFixed(0)}% speed</span>
        </div>
      )}

      {aliased && (
        <div className="viewport-alias">
          ⚠ Display sampling: {stepPerFrame.toFixed(0)}° per frame — rendered motion is
          aliased (stroboscopic) and reads slower than it is. Reduce the time scale to
          observe the cycle.
        </div>
      )}

      <div className="viewport-views">
        {presets.map((p: ViewPreset) => (
          <button
            key={p.key}
            className={`btn btn-sm ${viewKey === p.key ? 'btn-primary' : ''}`}
            onClick={() => setViewKey(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <button className="btn btn-sm viewport-reset" onClick={() => setResetNonce((n) => n + 1)}>
        ↺ Reset view
      </button>
    </div>
  );
}
