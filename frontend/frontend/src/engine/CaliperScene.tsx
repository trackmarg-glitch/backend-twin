/** The brake caliper on a spinning disc. */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  type BrakeState,
  type CaliperGeometry,
  REFERENCE_DISC,
  discGlowColour,
} from './brakeKinematics';

const IRON = '#8d98a8';
const PAD = '#3b3027';

/** One leg of the caliper, with the piston bore pocket shown as a recess. */
function CaliperLeg({
  geometry,
  side,
  offset,
  showBore,
}: {
  geometry: CaliperGeometry;
  side: -1 | 1;
  offset: number;
  showBore: boolean;
}) {
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: IRON, metalness: 0.8, roughness: 0.42 }),
    [],
  );
  const ref = useRef<THREE.Group>(null);

  const slotDepth = geometry.bodyHeight * geometry.slotDepthFraction;
  const legZ = side * (geometry.discSlotWidth / 2 + geometry.wallThickness / 2);

  useFrame(() => {
    // The legs spread apart as the mouth opens.
    if (ref.current) ref.current.position.z = legZ + side * offset * 0.5;
  });

  return (
    <group ref={ref} position={[0, 0, legZ]}>
      <mesh material={material} position={[0, slotDepth / 2, 0]}>
        <boxGeometry args={[geometry.bodyLength, slotDepth, geometry.wallThickness]} />
      </mesh>

      {showBore && (
        <mesh
          position={[0, slotDepth * 0.45, -side * (geometry.wallThickness / 2 - 0.002)]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry
            args={[
              geometry.pistonBoreDiameter / 2,
              geometry.pistonBoreDiameter / 2,
              0.006,
              28,
            ]}
          />
          <meshStandardMaterial color="#5d6a7a" metalness={0.9} roughness={0.25} />
        </mesh>
      )}
    </group>
  );
}

export interface CaliperSceneProps {
  geometry: CaliperGeometry;
  brake: BrakeState;
  /** Display exaggeration applied to the computed mouth opening. */
  openingScale: number;
}

export function CaliperScene({ geometry, brake, openingScale }: CaliperSceneProps) {
  const discRef = useRef<THREE.Group>(null);
  const discMeshRef = useRef<THREE.Mesh>(null);
  const padInRef = useRef<THREE.Mesh>(null);
  const padOutRef = useRef<THREE.Mesh>(null);
  const pistonRef = useRef<THREE.Mesh>(null);
  const sparksRef = useRef<THREE.Points>(null);

  const slotDepth = geometry.bodyHeight * geometry.slotDepthFraction;
  const bridgeY = slotDepth + geometry.bridgeThickness / 2;
  const discOuter = REFERENCE_DISC.outerDiameter / 2;
  const openingMetres = brake.mouthOpening * openingScale;

  const ironMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: IRON, metalness: 0.8, roughness: 0.42 }),
    [],
  );
  const padMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: PAD, metalness: 0.1, roughness: 0.95 }),
    [],
  );
  const discMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#39414c',
        metalness: 0.85,
        roughness: 0.38,
        emissive: new THREE.Color('#000000'),
        emissiveIntensity: 1,
      }),
    [],
  );

  // A ring of friction sparks that brightens with clamping and speed.
  const sparkGeometry = useMemo(() => {
    const count = 160;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = discOuter * (0.86 + Math.random() * 0.16);
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = (Math.random() - 0.5) * REFERENCE_DISC.thickness * 2.4;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [discOuter]);

  const sparkMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: '#ffb347',
        size: 0.004,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );

  useFrame(() => {
    if (discRef.current) discRef.current.rotation.z = (brake.discAngle * Math.PI) / 180;

    if (discMeshRef.current) {
      const material = discMeshRef.current.material as THREE.MeshStandardMaterial;
      const colour = discGlowColour(brake.temperatureRise);
      material.emissive.set(colour);
      material.emissiveIntensity = Math.min(1, brake.temperatureRise / 420) * 1.5;
    }

    // Pads close onto the disc as pressure rises.
    const gap = REFERENCE_DISC.thickness / 2 + 0.004 - brake.padTravel;
    if (padInRef.current) padInRef.current.position.z = -gap;
    if (padOutRef.current) padOutRef.current.position.z = gap;
    if (pistonRef.current) {
      pistonRef.current.position.z = -gap - 0.012 + brake.padTravel;
    }

    if (sparksRef.current) {
      const material = sparksRef.current.material as THREE.PointsMaterial;
      material.opacity = brake.pressureFraction * brake.speedFraction * 0.85;
      sparksRef.current.rotation.z = (brake.discAngle * Math.PI) / 180;
    }
  });

  const padWidth = geometry.bodyLength * 0.78;
  const padHeight = slotDepth * 0.62;

  return (
    <group position={[0, -discOuter * 0.55, 0]}>
      {/* Brake disc — illustrative context */}
      <group ref={discRef}>
        <mesh ref={discMeshRef} rotation={[Math.PI / 2, 0, 0]} material={discMaterial}>
          <cylinderGeometry
            args={[discOuter, discOuter, REFERENCE_DISC.thickness, 72, 1, false]}
          />
        </mesh>
        {/* Vane slots, so rotation is legible */}
        {Array.from({ length: 24 }, (_, i) => {
          const angle = (i * Math.PI * 2) / 24;
          const r = discOuter * 0.72;
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * r, Math.sin(angle) * r, 0]}
              rotation={[0, 0, angle]}
            >
              <boxGeometry args={[0.03, 0.006, REFERENCE_DISC.thickness * 1.02]} />
              <meshStandardMaterial color="#20262e" metalness={0.6} roughness={0.7} />
            </mesh>
          );
        })}
        {/* Hat */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.022]} material={ironMaterial}>
          <cylinderGeometry
            args={[REFERENCE_DISC.innerDiameter / 2, REFERENCE_DISC.innerDiameter / 2, 0.04, 40, 1, true]}
          />
        </mesh>
      </group>

      {/* Friction sparks at the rubbing band */}
      <points ref={sparksRef} geometry={sparkGeometry} material={sparkMaterial} />

      {/* Caliper straddling the disc at the top of the swept area */}
      <group position={[0, discOuter * 0.86, 0]}>
        <CaliperLeg geometry={geometry} side={-1} offset={openingMetres} showBore />
        <CaliperLeg geometry={geometry} side={1} offset={openingMetres} showBore={false} />

        {/* Bridge joining the legs — the member that resists the opening */}
        <mesh position={[0, bridgeY, 0]} material={ironMaterial}>
          <boxGeometry
            args={[
              geometry.bodyLength,
              geometry.bridgeThickness,
              geometry.discSlotWidth + 2 * geometry.wallThickness,
            ]}
          />
        </mesh>

        {/* Bridge ribs, generated from the parameter */}
        {Array.from({ length: Math.round(geometry.ribCount) }, (_, i) => {
          const count = Math.round(geometry.ribCount);
          const spacing = geometry.bodyLength / (count + 1);
          const x = -geometry.bodyLength / 2 + spacing * (i + 1);
          return (
            <mesh
              key={i}
              position={[x, slotDepth - 0.006, 0]}
              material={ironMaterial}
            >
              <boxGeometry args={[geometry.ribThickness, 0.012, geometry.discSlotWidth]} />
            </mesh>
          );
        })}

        {/* Mounting ears */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[
              (side * geometry.mountHoleSpacing) / 2,
              bridgeY,
              -(geometry.discSlotWidth / 2 + geometry.wallThickness),
            ]}
            material={ironMaterial}
          >
            <cylinderGeometry
              args={[geometry.mountHoleDiameter, geometry.mountHoleDiameter, 0.012, 16]}
            />
          </mesh>
        ))}

        {/* Pads either side of the disc */}
        <mesh ref={padInRef} position={[0, padHeight / 2 + 0.004, -0.02]} material={padMaterial}>
          <boxGeometry args={[padWidth, padHeight, 0.011]} />
        </mesh>
        <mesh ref={padOutRef} position={[0, padHeight / 2 + 0.004, 0.02]} material={padMaterial}>
          <boxGeometry args={[padWidth, padHeight, 0.011]} />
        </mesh>

        {/* Piston behind the inboard pad */}
        <mesh
          ref={pistonRef}
          position={[0, padHeight / 2 + 0.004, -0.032]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry
            args={[
              geometry.pistonBoreDiameter / 2,
              geometry.pistonBoreDiameter / 2,
              0.016,
              28,
            ]}
          />
          <meshStandardMaterial color="#c3ccd8" metalness={0.92} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}
