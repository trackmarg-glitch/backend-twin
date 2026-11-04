/** Dashboard: what AutoTwin is, and the three ways in.
 *
 * Deliberately not a metrics wall. The tiles carry a live 3D preview of the
 * actual parametric template rather than a stock image, so the first thing on
 * screen is the real thing the product makes. */

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { Empty, Note, Panel, Source } from '../components/primitives';
import { CostScenario } from '../components/CostScenario';
import { useStore } from '../store/useStore';
import type { ComponentType, Profile } from '../types/api';
import { WheelScene } from '../engine/WheelScene';
import { CaliperScene } from '../engine/CaliperScene';
import { EngineScene, REFERENCE_PLUG } from '../engine/EngineScene';
import { REFERENCE_ENGINE, engineState } from '../engine/kinematics';
import { INITIAL_BRAKE_STATE } from '../engine/brakeKinematics';

const COPY: Record<ComponentType, { desc: string; analysis: string }> = {
  alloy_wheel: {
    desc: 'Explore spoke, hub and rim proportions that cut mass while holding stress and deflection inside your limits.',
    analysis: 'Structural FEA',
  },
  brake_caliper: {
    desc: 'Trim bridge, wall and rib sections without letting the caliper mouth open past its limit under clamping.',
    analysis: 'Structural FEA',
  },
  spark_plug: {
    desc: 'Tune insulator nose and electrode geometry so the firing end stays inside its heat-range window.',
    analysis: 'Thermal FEA',
  },
};

/* --------------------------------------------------------- tile preview */

function TilePreview({ type }: { type: ComponentType }) {
  const wheel = useMemo(
    () => ({
      rimDiameter: 0.4318, rimWidth: 0.1905, rimWallThickness: 0.008,
      hubDiameter: 0.16, boreDiameter: 0.0666, boltCircleDiameter: 0.112,
      boltHoleDiameter: 0.014, boltCount: 5, spokeCount: 7,
      spokeRootWidth: 0.044, spokeTipWidth: 0.03, spokeThickness: 0.016,
      spokeDish: 0.085, hubThickness: 0.02,
    }),
    [],
  );

  const caliper = useMemo(
    () => ({
      bodyLength: 0.13, discSlotWidth: 0.034, wallThickness: 0.02,
      bridgeThickness: 0.02, bodyHeight: 0.095, slotDepthFraction: 0.62,
      ribCount: 2, ribThickness: 0.008, pistonBoreDiameter: 0.048,
      mountHoleDiameter: 0.012, mountHoleSpacing: 0.096,
    }),
    [],
  );

  const states = useMemo(() => engineState(30, REFERENCE_ENGINE), []);

  const camera: Record<ComponentType, [number, number, number]> = {
    alloy_wheel: [0.22, 0.14, 0.62],
    brake_caliper: [0.30, 0.18, 0.34],
    spark_plug: [0.26, 0.16, 0.34],
  };

  return (
    <Canvas
      camera={{ position: camera[type], fov: 38, near: 0.005, far: 20 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      frameloop="demand"
    >
      <color attach="background" args={['#090b0f']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[0.5, 0.9, 0.7]} intensity={1.6} color="#d6e8f8" />
      <directionalLight position={[-0.7, 0.1, -0.5]} intensity={0.55} color="#3f7cb8" />
      <hemisphereLight args={['#3d6185', '#05080e', 0.5]} />

      <Suspense fallback={null}>
        {type === 'alloy_wheel' && (
          <group scale={0.95}>
            <WheelScene geometry={wheel} rotationDeg={18} showLoad={false} />
          </group>
        )}
        {type === 'brake_caliper' && (
          <group scale={0.95} position={[0, 0.06, 0]}>
            <CaliperScene geometry={caliper} brake={INITIAL_BRAKE_STATE} openingScale={0} />
          </group>
        )}
        {type === 'spark_plug' && (
          <group scale={1.5} position={[0, -0.08, 0]}>
            <EngineScene
              crankDeg={30}
              states={states}
              geometry={REFERENCE_ENGINE}
              tipColours={{ A: '#f5a524', B: '#22d3ee' }}
              plug={REFERENCE_PLUG}
              showBlock={false}
            />
          </group>
        )}
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate
        autoRotateSpeed={0.9}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.9}
      />
    </Canvas>
  );
}

/* ------------------------------------------------------------- the page */

const FLOW = ['Requirements', 'Generate', 'Simulate', 'Optimize', 'Compare', 'Export'];

export function Dashboard() {
  const store = useStore();
  const navigate = useNavigate();
  const profiles = store.profiles;

  const start = (type: ComponentType) => {
    store.chooseComponent(type);
    navigate('/new');
  };

  return (
    <>
      <div className="main-body" style={{ paddingTop: 22 }}>
        <section className="hero">
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="hero-eyebrow">AutoTwin · Virtual Prototyping Platform</div>
            <h1 className="hero-title">
              Engineering the next generation of automotive components
            </h1>
            <div className="hero-sub">
              <strong>Generate.</strong> <strong>Simulate.</strong> <strong>Optimize.</strong>{' '}
              <strong>Validate.</strong>
            </div>
            <div className="sm faint" style={{ marginTop: 18, maxWidth: '58ch' }}>
              Describe what a component must achieve. AutoTwin builds real parametric CAD,
              meshes it, runs finite-element analysis, searches the design space and shows
              you which candidates are worth prototyping — with every number traceable to
              the solver that produced it.
            </div>
          </div>
        </section>

        <div style={{ marginTop: 26 }}>
          <div className="section-label">Choose a component to engineer</div>

          {profiles.length === 0 ? (
            <Panel>
              <Empty icon="◴">Loading component profiles from the backend…</Empty>
            </Panel>
          ) : (
            <div className="tile-grid">
              {profiles.map((profile: Profile) => {
                const copy = COPY[profile.component_type];
                return (
                  <button
                    key={profile.component_type}
                    className="tile"
                    onClick={() => start(profile.component_type)}
                  >
                    <div className="tile-canvas">
                      <span className="chip chip-grey tile-tag">{copy?.analysis}</span>
                      <TilePreview type={profile.component_type} />
                    </div>
                    <div className="tile-body">
                      <div className="tile-name">{profile.display_name}</div>
                      <div className="tile-desc">{copy?.desc ?? profile.summary}</div>
                      <div className="row" style={{ gap: 7, marginTop: 11 }}>
                        <span className="chip chip-grey">
                          {profile.design_variables.length} variables
                        </span>
                        <span className="chip chip-grey">
                          {profile.materials.length} materials
                        </span>
                      </div>
                      <span className="tile-cta">Start designing →</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: 26 }}>
          <div className="section-label">How it works</div>
          <div className="flow">
            {FLOW.map((label, i) => (
              <div key={label} className="flow-step" style={{ flex: i < FLOW.length - 1 ? 1 : 'none' }}>
                <div className="flow-dot">{String(i + 1).padStart(2, '0')}</div>
                <div className="flow-label">{label}</div>
                {i < FLOW.length - 1 && <div className="flow-arrow" />}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <Note tone="cyan">
            Live previews while you edit are reduced-order estimates <Source kind="estimate" />.
            Committed results come from the finite-element solver <Source kind="solver" />,
            verified on startup against analytical benchmarks. AutoTwin produces
            virtual-prototyping predictions — not a certification, and not a substitute for
            the physical validation your process requires.
          </Note>
        </div>

        {/* The evidence ceiling, stated on the first screen rather than buried
            in a report. Everything above 'numerically verified' needs physical
            measurement, and this installation has none. */}
        {store.capabilities?.assurance && (
          <div style={{ marginTop: 14 }}>
            <div className="section-label">How far the evidence goes</div>
            <div className="ladder-strip">
              {store.capabilities.assurance.maturity_levels.map((level) => {
                const ceiling =
                  store.capabilities!.assurance!.maturity_levels.find(
                    (l) => l.level === store.capabilities!.assurance!.attained_maturity,
                  )?.ordinal ?? 0;
                const reachable = level.ordinal <= ceiling;
                return (
                  <div
                    key={level.level}
                    className={`ladder-cell ${reachable ? 'on' : ''}`}
                    title={`${level.evidence_required}\n\nDoes not establish: ${level.prohibited_claims.join(' ')}`}
                  >
                    <div className="ladder-ord">L{level.ordinal}</div>
                    <div className="ladder-name">{level.label}</div>
                    <div className="ladder-state">
                      {reachable ? 'reachable here' : 'needs physical test data'}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="xs faint" style={{ marginTop: 8, lineHeight: 1.6 }}>
              {store.capabilities.assurance.attained_maturity_note} Each level is
              derived from recorded evidence by a deterministic check service — the
              assistant cannot assign or raise one.
            </div>
          </div>
        )}

        {/* Kept below the evidence ladder and behind a disclosure on purpose.
            Everything above this point is measured or derived from recorded
            evidence; this is arithmetic on figures the engineer supplies, and
            putting the two side by side would invite reading one as the
            other. */}
        <CostScenario />
      </div>
    </>
  );
}
