/** The animated inline-four cutaway.
 *
 * Geometry is built from the engine dimensions, and every moving part is driven
 * by the crank angle through real slider-crank relations - pistons, rods and
 * crank throws all follow from the same angle, so the motion is kinematically
 * consistent rather than four independent loops.
 *
 * The engine is illustrative context and is labelled as such in the UI. What is
 * not illustrative is the plug tip colour and the per-cylinder temperature,
 * which come from solver output when a result exists. */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CYLINDER_DESIGN,
  type CylinderState,
  type EngineGeometry,
  pistonDrop,
} from './kinematics';

const A_COLOUR = '#f0a93b';
const B_COLOUR = '#38bdf8';

/* ------------------------------------------------------- shared materials */

function useMaterials() {
  return useMemo(() => {
    const steel = new THREE.MeshStandardMaterial({
      color: '#aab6c4',
      metalness: 0.92,
      roughness: 0.3,
    });
    const darkSteel = new THREE.MeshStandardMaterial({
      color: '#49566a',
      metalness: 0.85,
      roughness: 0.42,
    });
    const block = new THREE.MeshStandardMaterial({
      color: '#1a2534',
      metalness: 0.5,
      roughness: 0.65,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
    });
    const bore = new THREE.MeshStandardMaterial({
      color: '#7e8d9f',
      metalness: 0.6,
      roughness: 0.55,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
    });
    const ceramic = new THREE.MeshStandardMaterial({
      color: '#e8ecf1',
      metalness: 0.05,
      roughness: 0.52,
    });
    const shell = new THREE.MeshStandardMaterial({
      color: '#2f3a49',
      metalness: 0.88,
      roughness: 0.35,
    });
    return { steel, darkSteel, block, bore, ceramic, shell };
  }, []);
}

/* ------------------------------------------------------------ spark plug */

/** One spark plug: ribbed ceramic insulator, metal shell, A/B seat ring, tip. */
export interface PlugGeometry {
  /** Insulator nose exposed below the shell — the heat-range variable. */
  noseLength: number;
  noseDiameter: number;
  electrodeDiameter: number;
  electrodeProtrusion: number;
  threadDiameter: number;
  shellLength: number;
}

export const REFERENCE_PLUG: PlugGeometry = {
  noseLength: 0.0075,
  noseDiameter: 0.0062,
  electrodeDiameter: 0.0025,
  electrodeProtrusion: 0.0020,
  threadDiameter: 0.014,
  shellLength: 0.022,
};

function SparkPlug({
  design,
  tipColour,
  scale = 1.6,
  plug = REFERENCE_PLUG,
}: {
  design: 'A' | 'B';
  tipColour: string;
  scale?: number;
  plug?: PlugGeometry;
}) {
  const m = useMaterials();
  const accent = design === 'A' ? A_COLOUR : B_COLOUR;

  const seatMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: accent,
        metalness: 0.6,
        roughness: 0.35,
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.45,
      }),
    [accent],
  );

  const tipMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: tipColour,
        metalness: 0.7,
        roughness: 0.4,
        emissive: new THREE.Color(tipColour),
        emissiveIntensity: 1.1,
      }),
    [tipColour],
  );

  // Dimensions come from the design parameters, exaggerated by `scale` so the
  // plug reads at engine scale. The exaggeration is stated in the overlay.
  const s = scale;
  const shellRadius = (plug.threadDiameter / 2) * s;
  const noseRadius = (plug.noseDiameter / 2) * s;
  const electrodeRadius = (plug.electrodeDiameter / 2) * s;
  const noseLength = plug.noseLength * s;
  const protrusion = plug.electrodeProtrusion * s;
  const threadLength = plug.shellLength * s * 0.78;
  const ribs = useMemo(() => [0, 1, 2, 3].map((i) => 0.030 * s - i * 0.0075 * s), [s]);

  return (
    <group>
      {/* Ceramic insulator barrel */}
      <mesh position={[0, 0.040 * s, 0]} material={m.ceramic}>
        <cylinderGeometry args={[0.0085 * s, 0.0085 * s, 0.040 * s, 20]} />
      </mesh>

      {/* Corrugated ribs on the insulator */}
      {ribs.map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.ceramic}>
          <torusGeometry args={[0.0088 * s, 0.0022 * s, 8, 22]} />
        </mesh>
      ))}

      {/* Metal shell / hex body */}
      <mesh position={[0, 0.0095 * s, 0]} material={m.shell}>
        <cylinderGeometry args={[shellRadius * 1.17, shellRadius * 1.17, 0.015 * s, 6]} />
      </mesh>

      {/* Colour-coded seat ring — the A/B identity marker */}
      <mesh position={[0, 0.0012 * s, 0]} material={seatMaterial}>
        <cylinderGeometry args={[shellRadius * 1.2, shellRadius * 1.2, 0.0028 * s, 20]} />
      </mesh>

      {/* Threaded nose, at the preserved thread diameter */}
      <mesh position={[0, -threadLength / 2, 0]} material={m.shell}>
        <cylinderGeometry args={[shellRadius, shellRadius, threadLength, 18]} />
      </mesh>

      {/* Insulator nose protruding past the shell — the heat-range variable */}
      <mesh position={[0, -threadLength - noseLength / 2, 0]} material={m.ceramic}>
        <cylinderGeometry args={[noseRadius * 0.9, noseRadius, noseLength, 16]} />
      </mesh>

      {/* Centre electrode, coloured by the computed tip temperature */}
      <mesh
        position={[0, -threadLength - noseLength - protrusion / 2, 0]}
        material={tipMaterial}
      >
        <cylinderGeometry args={[electrodeRadius, electrodeRadius, protrusion, 12]} />
      </mesh>

      {/* Ground electrode strap reaching across the gap */}
      <mesh
        position={[0, -threadLength - noseLength / 2, shellRadius * 0.62]}
        material={m.shell}
      >
        <boxGeometry args={[electrodeRadius * 2, noseLength + protrusion, electrodeRadius]} />
      </mesh>
      <mesh
        position={[
          0,
          -threadLength - noseLength - protrusion - electrodeRadius,
          shellRadius * 0.31,
        ]}
        material={m.shell}
      >
        <boxGeometry args={[electrodeRadius * 2, electrodeRadius, shellRadius * 1.24]} />
      </mesh>
    </group>
  );
}

/* --------------------------------------------------------- flame kernel */

/** Radial-gradient sprite used for the combustion flare. */
function useGlowTexture() {
  return useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0.0, 'rgba(255,255,248,1)');
      g.addColorStop(0.18, 'rgba(255,236,178,0.96)');
      g.addColorStop(0.42, 'rgba(255,178,74,0.62)');
      g.addColorStop(0.72, 'rgba(236,122,32,0.2)');
      g.addColorStop(1.0, 'rgba(180,70,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);
}

/* ------------------------------------------------------------- cylinder */

interface CylinderProps {
  state: CylinderState;
  geometry: EngineGeometry;
  x: number;
  tipColour: string;
  showPlug: boolean;
  plugScale: number;
  plug: PlugGeometry;
}

/** One cylinder assembly: bore, piston, rod and plug, with the flame kernel. */
function Cylinder({ state, geometry, x, tipColour, showPlug, plugScale, plug }: CylinderProps) {
  const m = useMaterials();
  const texture = useGlowTexture();

  const pistonRef = useRef<THREE.Group>(null);
  const rodRef = useRef<THREE.Mesh>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const r = geometry.stroke / 2;
  const l = geometry.rodLength;
  const deckHeight = geometry.stroke + 0.028;

  const glowMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      }),
    [texture],
  );

  useFrame(() => {
    const theta = (state.cycleAngle * Math.PI) / 180;
    const drop = pistonDrop(state.cycleAngle, geometry);
    const pistonY = deckHeight - drop;

    if (pistonRef.current) pistonRef.current.position.y = pistonY;

    // Crank pin position, and the rod that connects it to the piston pin.
    if (rodRef.current) {
      const pinY = -r * Math.cos(theta);
      const pinZ = r * Math.sin(theta);
      const dy = pistonY - pinY;
      const dz = -pinZ;
      const length = Math.hypot(dy, dz) || l;
      rodRef.current.position.set(0, (pistonY + pinY) / 2, pinZ / 2);
      rodRef.current.rotation.x = Math.atan2(dz, dy);
      rodRef.current.scale.y = length / l;
    }

    // Flame kernel tracks the combustion envelope.
    const intensity = state.combustion;
    if (spriteRef.current) {
      const size = geometry.bore * (0.5 + 1.35 * intensity);
      spriteRef.current.scale.set(size, size, 1);
      spriteRef.current.position.y = pistonY + geometry.bore * 0.34;
      (spriteRef.current.material as THREE.SpriteMaterial).opacity = intensity;
    }
    if (lightRef.current) {
      lightRef.current.intensity = intensity * 2.6;
      lightRef.current.position.y = pistonY + geometry.bore * 0.3;
    }
  });

  return (
    <group position={[x, 0, 0]}>
      {/* Cylinder bore wall, drawn as a translucent sleeve */}
      <mesh position={[0, deckHeight - geometry.stroke * 0.22, 0]} material={m.bore}>
        <cylinderGeometry
          args={[geometry.bore / 2, geometry.bore / 2, geometry.stroke * 1.5, 28, 1, true]}
        />
      </mesh>

      {/* Piston with crown, skirt and ring lands */}
      <group ref={pistonRef}>
        <mesh material={m.steel}>
          <cylinderGeometry args={[geometry.bore / 2 - 0.0012, geometry.bore / 2 - 0.0012, 0.030, 28]} />
        </mesh>
        {[0.010, 0.0035, -0.003].map((y, i) => (
          <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.darkSteel}>
            <torusGeometry args={[geometry.bore / 2 - 0.0012, 0.0011, 6, 28]} />
          </mesh>
        ))}
        <mesh position={[0, -0.022, 0]} rotation={[0, 0, Math.PI / 2]} material={m.darkSteel}>
          <cylinderGeometry args={[0.0075, 0.0075, 0.030, 14]} />
        </mesh>
      </group>

      {/* Connecting rod */}
      <mesh ref={rodRef} material={m.steel}>
        <boxGeometry args={[0.014, l, 0.009]} />
      </mesh>

      {/* Crank throw: pin plus counterweight, rotating with the shaft */}
      <group rotation={[(state.cycleAngle * Math.PI) / 180, 0, 0]}>
        <mesh position={[0, -r, 0]} rotation={[0, 0, Math.PI / 2]} material={m.darkSteel}>
          <cylinderGeometry args={[0.0135, 0.0135, 0.026, 16]} />
        </mesh>
        <mesh position={[0, r * 0.62, 0]} material={m.darkSteel}>
          <boxGeometry args={[0.020, r * 1.15, 0.040]} />
        </mesh>
      </group>

      {/* Spark plug above the deck */}
      {showPlug && (
        <group position={[0, deckHeight + 0.030 * plugScale + 0.004, 0]}>
          <SparkPlug
            design={state.design}
            tipColour={tipColour}
            scale={plugScale}
            plug={plug}
          />
        </group>
      )}

      {/* Combustion flare */}
      <sprite ref={spriteRef} material={glowMaterial} scale={[geometry.bore, geometry.bore, 1]} />
      <pointLight
        ref={lightRef}
        color="#ffb347"
        intensity={0}
        distance={geometry.bore * 8}
        decay={2}
      />
    </group>
  );
}

/* --------------------------------------------------------- crankshaft */

function Crankshaft({ geometry, crankDeg }: { geometry: EngineGeometry; crankDeg: number }) {
  const m = useMaterials();
  const ref = useRef<THREE.Group>(null);
  const span = geometry.cylinderPitch * geometry.cylinders;

  useFrame(() => {
    if (ref.current) ref.current.rotation.x = (crankDeg * Math.PI) / 180;
  });

  return (
    <group ref={ref}>
      <mesh rotation={[0, 0, Math.PI / 2]} material={m.steel}>
        <cylinderGeometry args={[0.019, 0.019, span, 22]} />
      </mesh>
      {/* Main journals between throws */}
      {Array.from({ length: geometry.cylinders + 1 }, (_, i) => (
        <mesh
          key={i}
          position={[-span / 2 + i * geometry.cylinderPitch, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          material={m.darkSteel}
        >
          <cylinderGeometry args={[0.026, 0.026, 0.017, 20]} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------- the scene */

export interface EngineSceneProps {
  crankDeg: number;
  states: CylinderState[];
  geometry: EngineGeometry;
  /** Tip colour per design, derived from solver temperatures. */
  tipColours: Record<'A' | 'B', string>;
  showPlugs?: boolean;
  plugScale?: number;
  showBlock?: boolean;
  /** Plug geometry read from the live design parameters. */
  plug?: PlugGeometry;
}

export function EngineScene({
  crankDeg,
  states,
  geometry,
  tipColours,
  showPlugs = true,
  plugScale = 1.6,
  showBlock = true,
  plug = REFERENCE_PLUG,
}: EngineSceneProps) {
  const m = useMaterials();
  const span = geometry.cylinderPitch * geometry.cylinders;
  const deckHeight = geometry.stroke + 0.028;

  return (
    <group position={[0, -0.03, 0]}>
      {showBlock && (
        <>
          {/* Deck plate the plugs thread into */}
          <mesh position={[0, deckHeight + geometry.stroke * 0.30, 0]} material={m.block}>
            <boxGeometry args={[span, 0.018, geometry.bore * 1.5]} />
          </mesh>
          {/* Crankcase floor, for depth */}
          <mesh position={[0, -geometry.stroke * 1.25, 0]} material={m.block}>
            <boxGeometry args={[span, 0.012, geometry.bore * 1.6]} />
          </mesh>
        </>
      )}

      {states.map((state) => (
        <Cylinder
          key={state.index}
          state={state}
          geometry={geometry}
          x={-span / 2 + geometry.cylinderPitch * (state.index + 0.5)}
          tipColour={tipColours[state.design]}
          showPlug={showPlugs}
          plugScale={plugScale}
          plug={plug}
        />
      ))}

      <Crankshaft geometry={geometry} crankDeg={crankDeg} />
    </group>
  );
}

export { A_COLOUR, B_COLOUR, CYLINDER_DESIGN };
