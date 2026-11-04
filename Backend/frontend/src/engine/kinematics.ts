/** Four-stroke inline-4 kinematics.
 *
 * The animation is driven by real slider-crank geometry rather than a canned
 * loop: piston height comes from the crank radius and rod length, so changing
 * the engine geometry changes the motion correctly, and the stroke each
 * cylinder is in follows from its crank phase and the firing order.
 *
 * Honesty note carried through to the UI: the engine itself is illustrative
 * context. The plug tip temperatures that colour it come from the solver; the
 * bore, stroke and rod length are a stated reference geometry, not a model of
 * the customer's engine. */

export type Stroke = 'Power' | 'Exhaust' | 'Intake' | 'Compression';
export type DesignId = 'A' | 'B';

export interface EngineGeometry {
  /** Cylinder bore, metres. */
  bore: number;
  /** Full piston stroke, metres. Crank radius is half of this. */
  stroke: number;
  /** Connecting-rod centre-to-centre length, metres. */
  rodLength: number;
  /** Centre-to-centre cylinder spacing, metres. */
  cylinderPitch: number;
  cylinders: number;
}

/** Illustrative 2.0 L inline-four, matching the reference geometry. */
export const REFERENCE_ENGINE: EngineGeometry = {
  bore: 0.086,
  stroke: 0.086,
  rodLength: 0.1435,
  cylinderPitch: 0.096,
  cylinders: 4,
};

/** Firing order 1-3-4-2, the standard inline-four sequence. */
export const FIRING_ORDER = [1, 3, 4, 2] as const;

/**
 * Crank-angle offset of each cylinder within the 720-degree cycle.
 *
 * Cylinder 1 fires at 0 degrees; each subsequent cylinder in the firing order
 * fires 180 degrees later. Index is cylinder number minus one.
 */
export const CYLINDER_PHASE: number[] = (() => {
  const phase = new Array<number>(4).fill(0);
  FIRING_ORDER.forEach((cylinder, position) => {
    phase[cylinder - 1] = position * 180;
  });
  return phase;
})();

/** Which plug design sits in each cylinder: A in 1 and 4, B in 2 and 3. */
export const CYLINDER_DESIGN: DesignId[] = ['A', 'B', 'B', 'A'];

/** Normalise any angle into [0, 720). */
export function wrapCycle(angleDeg: number): number {
  return ((angleDeg % 720) + 720) % 720;
}

/**
 * Piston displacement from top dead centre, in metres.
 *
 * Exact slider-crank relation:
 *   x = r(1 - cos θ) + l - sqrt(l² - r² sin²θ)
 * measured downwards from TDC, so 0 is fully up.
 */
export function pistonDrop(crankDeg: number, geometry: EngineGeometry): number {
  const r = geometry.stroke / 2;
  const l = geometry.rodLength;
  const theta = (crankDeg * Math.PI) / 180;
  const sin = Math.sin(theta);
  const root = Math.sqrt(Math.max(l * l - r * r * sin * sin, 0));
  return r * (1 - Math.cos(theta)) + l - root;
}

/** The stroke a cylinder is in, from its position in the 720-degree cycle. */
export function strokeAt(cyclePositionDeg: number): Stroke {
  const p = wrapCycle(cyclePositionDeg);
  if (p < 180) return 'Power';
  if (p < 360) return 'Exhaust';
  if (p < 540) return 'Intake';
  return 'Compression';
}

/** Cycle position of one cylinder for a given global crank angle. */
export function cylinderCycleAngle(cylinderIndex: number, globalCrankDeg: number): number {
  return wrapCycle(globalCrankDeg - CYLINDER_PHASE[cylinderIndex]);
}

/**
 * Combustion flare intensity in [0, 1] for one cylinder.
 *
 * Ignition occurs slightly before top dead centre; the kernel grows fast, peaks
 * just after TDC and decays through the expansion stroke. This is a visual
 * envelope for the flame kernel, not a heat-release model.
 */
export function combustionIntensity(cyclePositionDeg: number): number {
  const p = wrapCycle(cyclePositionDeg);
  const advance = 18; // degrees before TDC
  // Treat the window as starting at (720 - advance) and running into the power stroke.
  const since = p >= 720 - advance ? p - (720 - advance) : p + advance;
  if (since < 0 || since > 150) return 0;
  if (since < 14) return since / 14; // kernel growth
  return Math.max(0, Math.pow(1 - (since - 14) / 136, 1.7)); // expansion decay
}

/** Crank degrees advanced per rendered frame, used to detect aliasing. */
export function crankDegreesPerFrame(
  rpm: number,
  timeScale: number,
  frameSeconds: number,
): number {
  return (rpm / 60) * 360 * timeScale * frameSeconds;
}

/** Ignition events per second for one cylinder: N/120 for a four-stroke. */
export function ignitionHzPerCylinder(rpm: number): number {
  return rpm / 120;
}

export interface CylinderState {
  index: number;
  number: number;
  design: DesignId;
  cycleAngle: number;
  /** Fraction of full stroke below TDC, 0 at top and 1 at bottom. */
  dropFraction: number;
  stroke: Stroke;
  combustion: number;
}

/** Full per-cylinder state for one global crank angle. */
export function engineState(
  globalCrankDeg: number,
  geometry: EngineGeometry = REFERENCE_ENGINE,
): CylinderState[] {
  const maxDrop = pistonDrop(180, geometry);
  return Array.from({ length: geometry.cylinders }, (_, index) => {
    const cycleAngle = cylinderCycleAngle(index, globalCrankDeg);
    const drop = pistonDrop(cycleAngle, geometry);
    return {
      index,
      number: index + 1,
      design: CYLINDER_DESIGN[index] ?? 'A',
      cycleAngle,
      dropFraction: maxDrop > 0 ? drop / maxDrop : 0,
      stroke: strokeAt(cycleAngle),
      combustion: combustionIntensity(cycleAngle),
    };
  });
}

/** Map a temperature to the heat-range colour ramp used for plug tips. */
export function tipColour(temperatureC: number): string {
  // Below the self-cleaning floor the tip is "cold"; above the pre-ignition
  // ceiling it is "too hot". The ramp between them is the usable window.
  const stops: Array<[number, [number, number, number]]> = [
    [20, [0.42, 0.46, 0.52]],
    [450, [0.85, 0.55, 0.18]],
    [650, [1.0, 0.68, 0.22]],
    [850, [1.0, 0.42, 0.18]],
    [1000, [1.0, 0.24, 0.2]],
  ];
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (temperatureC >= stops[i][0] && temperatureC <= stops[i + 1][0]) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  const span = upper[0] - lower[0] || 1;
  const t = Math.min(1, Math.max(0, (temperatureC - lower[0]) / span));
  const c = lower[1].map((v, i) => v + (upper[1][i] - v) * t);
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}
