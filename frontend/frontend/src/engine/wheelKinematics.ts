/** Rolling-wheel kinematics for the alloy-wheel animation.
 *
 * The point of this animation is not that a wheel spins. It is that a road
 * wheel is loaded *cyclically*: the radial load enters through a contact patch
 * fixed at the bottom of the wheel, so every spoke is loaded and unloaded once
 * per revolution as it rotates through that patch. That is what drives rotary
 * bending fatigue, and it is the thing a static FEA picture cannot show.
 *
 * The contact sector here is the same 50-degree patch the solver applies its
 * load over, so the highlighted spokes are genuinely the loaded ones. */

export interface WheelGeometry {
  rimDiameter: number;
  rimWidth: number;
  rimWallThickness: number;
  hubDiameter: number;
  boreDiameter: number;
  boltCircleDiameter: number;
  boltHoleDiameter: number;
  boltCount: number;
  spokeCount: number;
  spokeRootWidth: number;
  spokeTipWidth: number;
  spokeThickness: number;
  spokeDish: number;
  hubThickness: number;
}

/** Half-angle of the load patch, matching the solver's load region. */
export const CONTACT_HALF_ANGLE = 25;

/** The contact patch sits at the bottom of the wheel, towards -Y. */
export const CONTACT_CENTRE_DEG = 270;

/** Wheel rotation in degrees per second for a given road speed. */
export function wheelDegreesPerSecond(speedKph: number, rollingRadius: number): number {
  const metresPerSecond = speedKph / 3.6;
  const radiansPerSecond = metresPerSecond / Math.max(rollingRadius, 1e-6);
  return (radiansPerSecond * 180) / Math.PI;
}

/** Revolutions per minute at a given road speed. */
export function wheelRpm(speedKph: number, rollingRadius: number): number {
  return (wheelDegreesPerSecond(speedKph, rollingRadius) / 360) * 60;
}

/** Smallest absolute difference between two angles, in degrees. */
export function angularDistance(a: number, b: number): number {
  return Math.abs(((a - b + 180) % 360 + 360) % 360 - 180);
}

export interface SpokeState {
  index: number;
  /** Current angular position in the wheel's own frame, degrees. */
  angleDeg: number;
  /** 1 at the centre of the contact patch, 0 outside it. */
  load: number;
  inContact: boolean;
}

/** Per-spoke state for a given wheel rotation. */
export function spokeStates(rotationDeg: number, spokeCount: number): SpokeState[] {
  const count = Math.max(1, Math.round(spokeCount));
  return Array.from({ length: count }, (_, index) => {
    const angleDeg = (((index * 360) / count + rotationDeg) % 360 + 360) % 360;
    const distance = angularDistance(angleDeg, CONTACT_CENTRE_DEG);
    // Cosine taper across the patch rather than a hard edge: the real pressure
    // distribution falls off towards the edges of the contact.
    const load =
      distance > CONTACT_HALF_ANGLE
        ? 0
        : Math.cos(((distance / CONTACT_HALF_ANGLE) * Math.PI) / 2);
    return { index, angleDeg, load, inContact: distance <= CONTACT_HALF_ANGLE };
  });
}

/** Load cycles a spoke has seen after a distance at a given speed. */
export function loadCycles(rotationDeg: number): number {
  return rotationDeg / 360;
}

/**
 * Colour for a spoke by how hard it is currently loaded.
 *
 * Grey when unloaded through to amber at the centre of the contact patch. This
 * is a load *indicator*, not a stress field — the computed stress field lives
 * on the Analytics page and says so.
 */
export function spokeLoadColour(load: number): string {
  const base = [0.62, 0.68, 0.76];
  const hot = [0.94, 0.66, 0.23];
  const c = base.map((v, i) => v + (hot[i] - v) * Math.min(1, Math.max(0, load)));
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}
