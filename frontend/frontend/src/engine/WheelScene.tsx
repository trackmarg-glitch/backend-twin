/** The rolling alloy wheel.
 *
 * Geometry is generated from the same parameter vector the Design Lab edits, so
 * changing the spoke count or the dish changes this wheel. It is the design
 * under test, not a stand-in model.
 *
 * The animation shows the cyclic nature of the load: the contact patch stays at
 * the bottom while the wheel turns through it, so each spoke lights as it
 * carries the road load and fades as it leaves. */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CONTACT_CENTRE_DEG,
  CONTACT_HALF_ANGLE,
  type WheelGeometry,
  spokeLoadColour,
  spokeStates,
} from './wheelKinematics';

const ALLOY = '#aeb9c7';
const TYRE = '#14181d';

/** A tapered, dished spoke as an extruded trapezoid, mirroring the CAD. */
function spokeGeometry(g: WheelGeometry): THREE.BufferGeometry {
  const rOuter = g.rimDiameter / 2 - g.rimWallThickness;
  const rInner = g.hubDiameter / 2;
  const halfRoot = g.spokeRootWidth / 2;
  const halfTip = g.spokeTipWidth / 2;

  const shape = new THREE.Shape();
  shape.moveTo(rInner, -halfRoot);
  shape.lineTo(rOuter, -halfTip);
  shape.lineTo(rOuter, halfTip);
  shape.lineTo(rInner, halfRoot);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: g.spokeThickness,
    bevelEnabled: true,
    bevelThickness: g.spokeThickness * 0.12,
    bevelSize: g.spokeThickness * 0.12,
    bevelSegments: 2,
  });
  geometry.translate(0, 0, -g.spokeThickness / 2);
  return geometry;
}

function Spoke({
  geometry,
  angleDeg,
  dish,
  load,
}: {
  geometry: THREE.BufferGeometry;
  angleDeg: number;
  dish: number;
  load: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: ALLOY,
        metalness: 0.85,
        roughness: 0.3,
        emissive: new THREE.Color('#f0a93b'),
        emissiveIntensity: 0,
      }),
    [],
  );

  useFrame(() => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = load * 0.55;
    m.color.set(spokeLoadColour(load));
    // The loaded spoke deflects slightly towards the hub. The deflection is
    // exaggerated for visibility and labelled as such in the overlay.
    ref.current.position.z = dish / 2 - load * 0.004;
  });

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      material={material}
      rotation={[0, 0, (angleDeg * Math.PI) / 180]}
      position={[0, 0, dish / 2]}
      castShadow
    />
  );
}

export interface WheelSceneProps {
  geometry: WheelGeometry;
  rotationDeg: number;
  /** Shows the contact patch wedge and the road reaction arrow. */
  showLoad?: boolean;
  loadNewtons?: number;
}

export function WheelScene({ geometry, rotationDeg, showLoad = true }: WheelSceneProps) {
  const rOuter = geometry.rimDiameter / 2;
  const rRimInner = rOuter - geometry.rimWallThickness;
  const rHub = geometry.hubDiameter / 2;
  const rBore = geometry.boreDiameter / 2;
  const width = geometry.rimWidth;

  const spokeGeom = useMemo(() => spokeGeometry(geometry), [geometry]);
  const states = useMemo(
    () => spokeStates(rotationDeg, geometry.spokeCount),
    [rotationDeg, geometry.spokeCount],
  );

  const alloyMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: ALLOY, metalness: 0.85, roughness: 0.28 }),
    [],
  );
  const tyreMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: TYRE, metalness: 0.1, roughness: 0.92 }),
    [],
  );

  const wheelRef = useRef<THREE.Group>(null);
  const roadRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (wheelRef.current) wheelRef.current.rotation.z = (rotationDeg * Math.PI) / 180;
    // Scroll the road texture so the ground moves with the wheel.
    if (roadRef.current) {
      const material = roadRef.current.material as THREE.MeshStandardMaterial;
      if (material.map) {
        material.map.offset.x = ((rotationDeg / 360) * (2 * Math.PI * rOuter)) / 0.4;
      }
    }
  });

  const roadTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#10151c';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#1b2430';
      for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 28, 34, 7);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 1);
    return texture;
  }, []);

  return (
    <group>
      {/* Wheel assembly, rotating about its axis */}
      <group ref={wheelRef}>
        {/* Tyre */}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={tyreMaterial}>
          <cylinderGeometry
            args={[rOuter + 0.055, rOuter + 0.055, width * 1.08, 64, 1, true]}
          />
        </mesh>
        {/* Tyre sidewalls */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[0, 0, (side * width * 1.08) / 2]}
            material={tyreMaterial}
          >
            <ringGeometry args={[rOuter - 0.004, rOuter + 0.055, 56]} />
          </mesh>
        ))}

        {/* Rim barrel */}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={alloyMaterial}>
          <cylinderGeometry args={[rOuter, rOuter, width, 64, 1, true]} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={alloyMaterial}>
          <cylinderGeometry args={[rRimInner, rRimInner, width, 64, 1, true]} />
        </mesh>
        {/* Rim flanges close the barrel off at both ends */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[0, 0, (side * width) / 2]}
            material={alloyMaterial}
          >
            <ringGeometry args={[rRimInner, rOuter, 64]} />
          </mesh>
        ))}

        {/* Spokes, generated from the design parameters */}
        {states.map((state) => (
          <Spoke
            key={state.index}
            geometry={spokeGeom}
            angleDeg={state.angleDeg - rotationDeg}
            dish={geometry.spokeDish}
            load={state.load}
          />
        ))}

        {/* Hub pad with centre bore */}
        <mesh position={[0, 0, geometry.hubThickness / 2]} material={alloyMaterial}>
          <cylinderGeometry
            args={[rHub, rHub, geometry.hubThickness, 48]}
          />
        </mesh>
        <mesh position={[0, 0, geometry.hubThickness / 2]} material={alloyMaterial}>
          <torusGeometry args={[rBore, 0.004, 10, 40]} />
        </mesh>

        {/* Bolt holes, drawn as recesses */}
        {Array.from({ length: Math.round(geometry.boltCount) }, (_, i) => {
          const angle = (i * 2 * Math.PI) / Math.round(geometry.boltCount);
          const r = geometry.boltCircleDiameter / 2;
          return (
            <mesh
              key={i}
              position={[r * Math.cos(angle), r * Math.sin(angle), geometry.hubThickness + 0.001]}
            >
              <circleGeometry args={[geometry.boltHoleDiameter / 2, 18]} />
              <meshStandardMaterial color="#10151c" metalness={0.3} roughness={0.8} />
            </mesh>
          );
        })}
      </group>

      {/* Road surface at the contact patch */}
      <mesh
        ref={roadRef}
        position={[0, -(rOuter + 0.055), 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[2.4, 0.46]} />
        <meshStandardMaterial map={roadTexture} roughness={0.95} metalness={0} />
      </mesh>

      {showLoad && (
        <>
          {/* Contact patch wedge — the sector the solver loads */}
          <mesh position={[0, 0, 0]} rotation={[0, 0, 0]}>
            <ringGeometry
              args={[
                rOuter - 0.012,
                rOuter + 0.058,
                32,
                1,
                ((CONTACT_CENTRE_DEG - CONTACT_HALF_ANGLE) * Math.PI) / 180,
                (2 * CONTACT_HALF_ANGLE * Math.PI) / 180,
              ]}
            />
            <meshBasicMaterial
              color="#f0a93b"
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>

          {/* Road reaction arrow pushing up into the contact patch */}
          <group position={[0, -(rOuter + 0.075), 0]}>
            <mesh position={[0, -0.055, 0]}>
              <cylinderGeometry args={[0.007, 0.007, 0.11, 12]} />
              <meshStandardMaterial
                color="#f0a93b"
                emissive="#f0a93b"
                emissiveIntensity={0.7}
              />
            </mesh>
            <mesh position={[0, 0.012, 0]}>
              <coneGeometry args={[0.018, 0.045, 14]} />
              <meshStandardMaterial
                color="#f0a93b"
                emissive="#f0a93b"
                emissiveIntensity={0.9}
              />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
}
