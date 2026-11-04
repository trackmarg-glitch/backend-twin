/** The result mesh: the authoritative visualisation of a solved candidate.
 *
 * Geometry is built from the solver's own boundary surface (nodes + faces), and
 * colours come from the stored nodal field. The GLB preview is never used as the
 * source of result data, so what is on screen is the computed field and nothing
 * else.
 *
 * Displacement is applied as `node + displacement * scale`, where the scale is
 * an explicit exaggeration shown in the UI alongside the true maximum. */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { VisualizationPayload } from '../types/api';
import { fieldToColors, type ColorMapName } from './colormap';

interface Props {
  payload: VisualizationPayload;
  colorField: 'none' | 'stress' | 'temperature';
  deformationScale: number;
  /** 0 = undeformed, 1 = fully deformed. Used for the load-factor ramp. */
  phase: number;
  wireframe: boolean;
  colorMap?: ColorMapName;
}

function flatten(rows: number[][]): Float32Array {
  const out = new Float32Array(rows.length * 3);
  for (let i = 0; i < rows.length; i += 1) {
    out[i * 3] = rows[i][0];
    out[i * 3 + 1] = rows[i][1];
    out[i * 3 + 2] = rows[i][2];
  }
  return out;
}

function flattenIndices(rows: number[][]): Uint32Array {
  const out = new Uint32Array(rows.length * 3);
  for (let i = 0; i < rows.length; i += 1) {
    out[i * 3] = rows[i][0];
    out[i * 3 + 1] = rows[i][1];
    out[i * 3 + 2] = rows[i][2];
  }
  return out;
}

export function ResultMesh({
  payload,
  colorField,
  deformationScale,
  phase,
  wireframe,
  colorMap = 'viridis',
}: Props) {
  const meshRef = useRef<THREE.Mesh>(null);

  const base = useMemo(() => flatten(payload.nodes), [payload]);
  const indices = useMemo(() => flattenIndices(payload.faces), [payload]);
  const displacement = useMemo(
    () => (payload.displacement ? flatten(payload.displacement) : null),
    [payload],
  );

  const colors = useMemo(() => {
    if (colorField === 'stress' && payload.von_mises) {
      const [min, max] = payload.stress_range_pa ?? [
        Math.min(...payload.von_mises),
        Math.max(...payload.von_mises),
      ];
      return fieldToColors(payload.von_mises, min, max, colorMap);
    }
    if (colorField === 'temperature' && payload.temperature) {
      const [min, max] = payload.temperature_range_k ?? [
        Math.min(...payload.temperature),
        Math.max(...payload.temperature),
      ];
      return fieldToColors(payload.temperature, min, max, colorMap);
    }
    return null;
  }, [payload, colorField, colorMap]);

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    return geom;
  }, [base, indices]);

  // Dispose the previous geometry when the candidate changes, so switching
  // through a candidate list does not leak GPU buffers.
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Apply the deformation. Positions are rewritten rather than morphed because
  // candidate meshes have different topology, so there is no valid vertex
  // correspondence to interpolate between.
  useEffect(() => {
    const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    if (!displacement) {
      array.set(base);
    } else {
      const factor = deformationScale * phase;
      for (let i = 0; i < array.length; i += 1) {
        array[i] = base[i] + displacement[i] * factor;
      }
    }
    attribute.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }, [geometry, base, displacement, deformationScale, phase]);

  useEffect(() => {
    if (colors) {
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    } else {
      geometry.deleteAttribute('color');
    }
    geometry.attributes.color && (geometry.attributes.color.needsUpdate = true);
  }, [geometry, colors]);

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        vertexColors={Boolean(colors)}
        color={colors ? '#ffffff' : '#9fb4cc'}
        metalness={colors ? 0.05 : 0.45}
        roughness={colors ? 0.75 : 0.35}
        wireframe={wireframe}
        side={THREE.DoubleSide}
        flatShading={false}
      />
    </mesh>
  );
}

/** Semi-transparent reference copy of the undeformed shape. */
export function UndeformedGhost({ payload }: { payload: VisualizationPayload }) {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(flatten(payload.nodes), 3));
    geom.setIndex(new THREE.BufferAttribute(flattenIndices(payload.faces), 1));
    geom.computeVertexNormals();
    return geom;
  }, [payload]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color="#4da3ff"
        wireframe
        transparent
        opacity={0.16}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
