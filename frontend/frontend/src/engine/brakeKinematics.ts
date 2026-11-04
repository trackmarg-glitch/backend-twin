/** Brake-application kinematics for the caliper animation.
 *
 * The animation shows one brake application: pressure rises, the pistons push
 * the pads onto a spinning disc, friction decelerates it and heats the rubbing
 * band, and the caliper mouth opens under the clamping load.
 *
 * Everything here is a *visual envelope* driven by simple relations, not a
 * brake-system simulation. Pad friction, disc thermal mass and the deceleration
 * are illustrative; the caliper mouth opening is taken from the solver when a
 * result exists. The UI labels all of this. */

export interface CaliperGeometry {
  bodyLength: number;
  discSlotWidth: number;
  wallThickness: number;
  bridgeThickness: number;
  bodyHeight: number;
  slotDepthFraction: number;
  ribCount: number;
  ribThickness: number;
  pistonBoreDiameter: number;
  mountHoleDiameter: number;
  mountHoleSpacing: number;
}

/** Illustrative disc dimensions, stated on screen. */
export const REFERENCE_DISC = {
  outerDiameter: 0.330,
  innerDiameter: 0.180,
  thickness: 0.028,
};

export interface BrakeState {
  /** 0 to 1 through the application cycle. */
  phase: number;
  /** Line pressure as a fraction of the configured maximum. */
  pressureFraction: number;
  /** Pad travel towards the disc, metres. */
  padTravel: number;
  /** Disc rotation, degrees. */
  discAngle: number;
  /** Disc speed as a fraction of the initial speed. */
  speedFraction: number;
  /** Rubbing-band temperature rise, Kelvin above ambient. */
  temperatureRise: number;
  /** Caliper mouth opening, metres, exaggerated for display by the caller. */
  mouthOpening: number;
}

const PAD_CLEARANCE = 0.0012;

/**
 * Advance one brake application.
 *
 * The cycle is: free rotation, pressure ramp, full application with the disc
 * decelerating, then release and cool-down. Deceleration is proportional to
 * clamping pressure, which is the right shape even though the constant is
 * illustrative.
 */
export function stepBrake(
  previous: BrakeState,
  deltaSeconds: number,
  options: {
    cycleSeconds: number;
    initialDiscRpm: number;
    maxMouthOpening: number;
  },
): BrakeState {
  const cycle = Math.max(options.cycleSeconds, 0.5);
  const phase = (previous.phase + deltaSeconds / cycle) % 1;

  // Pressure profile: hold off, ramp on, hold, release.
  let pressureFraction: number;
  if (phase < 0.18) pressureFraction = 0;
  else if (phase < 0.34) pressureFraction = (phase - 0.18) / 0.16;
  else if (phase < 0.72) pressureFraction = 1;
  else if (phase < 0.86) pressureFraction = 1 - (phase - 0.72) / 0.14;
  else pressureFraction = 0;

  // Speed: constant until the pads bite, then decelerating under clamping.
  let speedFraction = previous.speedFraction;
  if (pressureFraction > 0.02) {
    speedFraction = Math.max(0.06, speedFraction - pressureFraction * deltaSeconds * 0.42);
  } else if (phase < 0.18) {
    // Fresh application: the wheel is back up to speed.
    speedFraction = Math.min(1, speedFraction + deltaSeconds * 1.6);
  }

  const discAngle =
    (previous.discAngle + options.initialDiscRpm * 6 * speedFraction * deltaSeconds) % 360;

  // Heat in proportional to friction power (clamp x sliding speed), out by a
  // simple exponential cooling. An envelope, not a thermal model.
  const generated = pressureFraction * speedFraction * 520 * deltaSeconds;
  const lost = previous.temperatureRise * 0.55 * deltaSeconds;
  const temperatureRise = Math.max(0, previous.temperatureRise + generated - lost);

  return {
    phase,
    pressureFraction,
    padTravel: PAD_CLEARANCE * pressureFraction,
    discAngle,
    speedFraction,
    temperatureRise,
    mouthOpening: options.maxMouthOpening * pressureFraction,
  };
}

export const INITIAL_BRAKE_STATE: BrakeState = {
  phase: 0,
  pressureFraction: 0,
  padTravel: 0,
  discAngle: 0,
  speedFraction: 1,
  temperatureRise: 0,
  mouthOpening: 0,
};

/** Disc glow colour for a temperature rise above ambient. */
export function discGlowColour(temperatureRise: number): string {
  const t = Math.min(1, temperatureRise / 420);
  // Dark iron through dull red to orange.
  const cold = [0.22, 0.24, 0.27];
  const hot = [1.0, 0.36, 0.1];
  const c = cold.map((v, i) => v + (hot[i] - v) * t);
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

/** Brake-application phase as a short label for the overlay. */
export function brakePhaseLabel(state: BrakeState): string {
  if (state.pressureFraction === 0 && state.phase < 0.18) return 'Running — brakes off';
  if (state.pressureFraction > 0 && state.phase < 0.34) return 'Pressure rising';
  if (state.pressureFraction === 1) return 'Full application';
  if (state.pressureFraction > 0) return 'Releasing';
  return 'Released — cooling';
}
