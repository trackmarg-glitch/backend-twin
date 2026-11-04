/** Wheel and brake kinematics verification.
 *
 * These animations make engineering claims — that each spoke is loaded once per
 * revolution, that the contact patch matches the sector the solver loads, that
 * the disc heats under clamping and cools when released. If the maths is wrong
 * the animation teaches the wrong thing, so it is tested like the engine is. */

import { describe, expect, it } from 'vitest';
import {
  CONTACT_CENTRE_DEG,
  CONTACT_HALF_ANGLE,
  angularDistance,
  spokeLoadColour,
  spokeStates,
  wheelDegreesPerSecond,
  wheelRpm,
} from './wheelKinematics';
import {
  INITIAL_BRAKE_STATE,
  brakePhaseLabel,
  discGlowColour,
  stepBrake,
} from './brakeKinematics';

const OPTIONS = { cycleSeconds: 6, initialDiscRpm: 420, maxMouthOpening: 0.0001 };

describe('rolling wheel', () => {
  it('converts road speed to rotation correctly', () => {
    // 90 km/h is 25 m/s; on a 0.316 m rolling radius that is 79.1 rad/s.
    const radius = 0.316;
    const degPerSec = wheelDegreesPerSecond(90, radius);
    expect((degPerSec * Math.PI) / 180).toBeCloseTo(25 / radius, 6);
    expect(wheelRpm(90, radius)).toBeCloseTo((25 / radius / (2 * Math.PI)) * 60, 6);
  });

  it('measures angular distance across the 0/360 wrap', () => {
    expect(angularDistance(350, 10)).toBeCloseTo(20, 10);
    expect(angularDistance(10, 350)).toBeCloseTo(20, 10);
    expect(angularDistance(0, 180)).toBeCloseTo(180, 10);
  });

  it('keeps the contact patch fixed while the wheel turns', () => {
    // Whatever the rotation, the loaded spokes are always those near the
    // bottom of the wheel — the patch does not rotate with the rim.
    for (const rotation of [0, 37, 123, 256, 341]) {
      for (const spoke of spokeStates(rotation, 7)) {
        if (spoke.inContact) {
          expect(angularDistance(spoke.angleDeg, CONTACT_CENTRE_DEG)).toBeLessThanOrEqual(
            CONTACT_HALF_ANGLE,
          );
        }
      }
    }
  });

  it('loads every spoke exactly once per revolution', () => {
    const count = 7;
    const everLoaded = new Set<number>();
    const entries = new Map<number, number>();
    let previous = spokeStates(0, count).map((s) => s.inContact);

    for (let rotation = 1; rotation <= 360; rotation += 1) {
      const states = spokeStates(rotation, count);
      states.forEach((state, index) => {
        if (state.inContact) everLoaded.add(index);
        // Count rising edges: an unloaded spoke becoming loaded.
        if (state.inContact && !previous[index]) {
          entries.set(index, (entries.get(index) ?? 0) + 1);
        }
      });
      previous = states.map((s) => s.inContact);
    }

    expect(everLoaded.size).toBe(count);
    for (const [, count_] of entries) expect(count_).toBe(1);
  });

  it('peaks at the centre of the patch and falls to zero at its edge', () => {
    const states = spokeStates(0, 360); // one spoke per degree
    const centre = states.find((s) => Math.round(s.angleDeg) === CONTACT_CENTRE_DEG);
    expect(centre?.load).toBeCloseTo(1, 3);

    const edge = states.find(
      (s) => Math.round(s.angleDeg) === CONTACT_CENTRE_DEG + CONTACT_HALF_ANGLE,
    );
    expect(edge?.load ?? 1).toBeLessThan(0.05);

    const outside = states.find((s) => Math.round(s.angleDeg) === 90);
    expect(outside?.load).toBe(0);
  });

  it('never reports a load outside [0, 1]', () => {
    for (let rotation = 0; rotation < 360; rotation += 7) {
      for (const spoke of spokeStates(rotation, 9)) {
        expect(spoke.load).toBeGreaterThanOrEqual(0);
        expect(spoke.load).toBeLessThanOrEqual(1);
      }
    }
  });

  it('places spokes evenly around the wheel', () => {
    const states = spokeStates(0, 5);
    const angles = states.map((s) => s.angleDeg).sort((a, b) => a - b);
    for (let i = 1; i < angles.length; i += 1) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(72, 6);
    }
  });

  it('returns a parseable colour that warms with load', () => {
    expect(spokeLoadColour(0)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    const cold = /(\d+), (\d+), (\d+)/.exec(spokeLoadColour(0))!.map(Number);
    const hot = /(\d+), (\d+), (\d+)/.exec(spokeLoadColour(1))!.map(Number);
    // Loaded spokes shift towards amber: more red, less blue.
    expect(hot[1]).toBeGreaterThan(cold[1]);
    expect(hot[3]).toBeLessThan(cold[3]);
  });
});

describe('brake application', () => {
  const run = (seconds: number, step = 1 / 60) => {
    let state = { ...INITIAL_BRAKE_STATE };
    const history = [state];
    for (let t = 0; t < seconds; t += step) {
      state = stepBrake(state, step, OPTIONS);
      history.push(state);
    }
    return { state, history };
  };

  it('applies and releases pressure within a cycle', () => {
    const { history } = run(6);
    const pressures = history.map((h) => h.pressureFraction);
    expect(Math.max(...pressures)).toBeCloseTo(1, 2);
    expect(Math.min(...pressures)).toBe(0);
  });

  it('decelerates the disc only while clamped', () => {
    const { history } = run(6);
    for (let i = 1; i < history.length; i += 1) {
      const before = history[i - 1];
      const after = history[i];
      if (before.pressureFraction > 0.1 && after.speedFraction > 0.07) {
        expect(after.speedFraction).toBeLessThanOrEqual(before.speedFraction + 1e-9);
      }
    }
  });

  it('never drives the disc backwards or past a standstill', () => {
    const { history } = run(18);
    for (const state of history) {
      expect(state.speedFraction).toBeGreaterThan(0);
      expect(state.speedFraction).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('heats the rubbing band under clamping and cools after release', () => {
    const { history } = run(6);
    const peak = Math.max(...history.map((h) => h.temperatureRise));
    expect(peak).toBeGreaterThan(20);

    // By the end of the released phase it must be cooling, not still climbing.
    const tail = history.slice(-20);
    expect(tail[tail.length - 1].temperatureRise).toBeLessThan(peak);
  });

  it('never produces a negative temperature rise', () => {
    const { history } = run(24);
    for (const state of history) expect(state.temperatureRise).toBeGreaterThanOrEqual(0);
  });

  it('opens the mouth in proportion to clamping, bounded by the solved value', () => {
    const { history } = run(6);
    for (const state of history) {
      expect(state.mouthOpening).toBeGreaterThanOrEqual(0);
      expect(state.mouthOpening).toBeLessThanOrEqual(OPTIONS.maxMouthOpening + 1e-12);
      expect(state.mouthOpening).toBeCloseTo(
        OPTIONS.maxMouthOpening * state.pressureFraction,
        12,
      );
    }
  });

  it('moves the pads only as far as the clearance allows', () => {
    const { history } = run(6);
    for (const state of history) {
      expect(state.padTravel).toBeGreaterThanOrEqual(0);
      expect(state.padTravel).toBeLessThanOrEqual(0.0012 + 1e-12);
    }
  });

  it('labels each phase of the cycle', () => {
    const labels = new Set(run(6).history.map(brakePhaseLabel));
    expect(labels.size).toBeGreaterThan(2);
  });

  it('glows hotter with temperature', () => {
    const cold = /(\d+), (\d+), (\d+)/.exec(discGlowColour(0))!.map(Number);
    const hot = /(\d+), (\d+), (\d+)/.exec(discGlowColour(420))!.map(Number);
    expect(hot[1]).toBeGreaterThan(cold[1]);
  });
});
