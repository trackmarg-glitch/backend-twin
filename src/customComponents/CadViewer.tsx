import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { StudioEnvironment } from '../three/common';

export type ViewMode = 'solid' | 'wire' | 'xray';

/**
 * Shows an imported part, centred and framed, with orbit controls. `scale`
 * converts the stored positions to mm; the scene works in mm.
 */
export function CadViewer({
  positions,
  scale,
  zUp = true,
  height = 420,
  color = '#9aa7bb',
}: {
  positions: Float32Array;
  scale: number;
  zUp?: boolean;
  height?: number;
  color?: string;
}) {
  const [mode, setMode] = useState<ViewMode>('solid');
  const [up, setUp] = useState(zUp);
  useEffect(() => setUp(zUp), [zUp]);

  const { geometry, radius } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.scale(scale, scale, scale);
    if (up) g.rotateX(-Math.PI / 2);
    g.computeBoundingBox();
    const c = new THREE.Vector3();
    g.boundingBox!.getCenter(c);
    // Sit the part on the grid, centred over the origin.
    g.translate(-c.x, -g.boundingBox!.min.y, -c.z);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return { geometry: g, radius: Math.max(g.boundingSphere!.radius, 1e-3) };
  }, [positions, scale, up]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const dist = radius * 2.6;
  const camPos: [number, number, number] = [dist * 0.75, radius * 1.1 + dist * 0.35, dist * 0.75];

  return (
    <div className="cc-viewer" style={{ height }}>
      <Canvas
        key={`${radius.toFixed(4)}-${up}`}
        camera={{ position: camPos, fov: 35, near: radius / 200, far: radius * 200 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <StudioEnvironment />
        <ambientLight intensity={0.35} />
        <directionalLight position={[radius * 3, radius * 5, radius * 2]} intensity={1.1} />
        <mesh geometry={geometry} castShadow>
          {mode === 'wire' ? (
            <meshBasicMaterial color="#6d5bd0" wireframe />
          ) : (
            <meshStandardMaterial
              color={color}
              metalness={0.55}
              roughness={0.38}
              transparent={mode === 'xray'}
              opacity={mode === 'xray' ? 0.35 : 1}
              depthWrite={mode !== 'xray'}
              side={THREE.DoubleSide}
            />
          )}
        </mesh>
        <gridHelper args={[radius * 6, 24, '#b9b4d6', '#dcd8ee']} />
        <OrbitControls makeDefault target={[0, radius * 0.6, 0]} enableDamping />
      </Canvas>
      <div className="cc-viewer-bar">
        <div className="seg">
          {(['solid', 'wire', 'xray'] as ViewMode[]).map((m) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {m === 'solid' ? 'Solid' : m === 'wire' ? 'Mesh' : 'X-ray'}
            </button>
          ))}
        </div>
        <div className="seg">
          <button className={up ? 'active' : ''} onClick={() => setUp(true)} title="Most CAD tools use Z as up">
            Z up
          </button>
          <button className={!up ? 'active' : ''} onClick={() => setUp(false)} title="glTF and many mesh tools use Y as up">
            Y up
          </button>
        </div>
        <span className="cc-viewer-hint">Drag to orbit · scroll to zoom · right-drag to pan</span>
      </div>
    </div>
  );
}
