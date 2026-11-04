/** Engine kinematics verification.
 *
 * The animation's credibility rests on these relations being right: if the
 * slider-crank is wrong the pistons do not travel the real stroke, and if the
 * phasing is wrong the firing order and stroke labels are fiction. */

import { describe, expect, it } from 'vitest';
import {
  CYLINDER_DESIGN,
  CYLINDER_PHASE,
  FIRING_ORDER,
  REFERENCE_ENGINE,
  combustionIntensity,
  crankDegreesPerFrame,
  cylinderCycleAngle,
  engineState,
  ignitionHzPerCylinder,
  pistonDrop,
  strokeAt,
  tipColour,
  wrapCycle,
} from './kinematics';

const G = REFERENCE_ENGINE;

describe('slider-crank geometry', () => {
  it('sits at top dead centre at 0 and 720 degrees', () => {
    expect(pistonDrop(0, G)).toBeCloseTo(0, 10);
    expect(pistonDrop(720, G)).toBeCloseTo(0, 10);
  });

  it('reaches exactly one full stroke at bottom dead centre', () => {
    // At 180 degrees the piston is a full stroke below TDC, by definition.
    expect(pistonDrop(180, G)).toBeCloseTo(G.stroke, 10);
  });

  it('never exceeds the stroke anywhere in the revolution', () => {
    for (let deg = 0; deg <= 720; deg += 1) {
      const drop = pistonDrop(deg, G);
      expect(drop).toBeGreaterThanOrEqual(-1e-12);
      expect(drop).toBeLessThanOrEqual(G.stroke + 1e-12);
    }
  });

  it('is asymmetric about mid-stroke, as a real rod length demands', () => {
    // With a finite rod the piston passes mid-stroke before 90 degrees; an
    // engine animated with a plain sine wave would be symmetric here.
    const atNinety = pistonDrop(90, G);
    expect(atNinety).toBeGreaterThan(G.stroke / 2);

    const r = G.stroke / 2;
    const expected = r + G.rodLength - Math.sqrt(G.rodLength ** 2 - r ** 2);
    expect(atNinety).toBeCloseTo(expected, 12);
  });

  it('approaches pure sinusoid as the rod grows very long', () => {
    // With an infinite rod the motion is exactly r(1 - cos θ). At a finite but
    // very long rod a second-order term of about r^2/(2l) remains, so the
    // tolerance here is set above that residual rather than below it.
    const long = { ...G, rodLength: 100 };
    const r = G.stroke / 2;
    const residual = (r * r) / (2 * long.rodLength);
    expect(residual).toBeLessThan(1e-5);

    for (const deg of [30, 90, 150]) {
      const harmonic = r * (1 - Math.cos((deg * Math.PI) / 180));
      expect(pistonDrop(deg, long)).toBeCloseTo(harmonic, 4);
    }
  });
});

describe('four-stroke phasing', () => {
  it('uses the 1-3-4-2 firing order at 180 degree spacing', () => {
    expect(FIRING_ORDER).toEqual([1, 3, 4, 2]);
    expect(CYLINDER_PHASE[0]).toBe(0); // cylinder 1
    expect(CYLINDER_PHASE[2]).toBe(180); // cylinder 3 fires second
    expect(CYLINDER_PHASE[3]).toBe(360); // cylinder 4 third
    expect(CYLINDER_PHASE[1]).toBe(540); // cylinder 2 last
  });

  it('pairs pistons 1 and 4 against 2 and 3', () => {
    // On an inline-four the throws are at 0 and 180, so 1/4 rise together
    // while 2/3 fall. This is visible in the reference video.
    for (const crank of [0, 45, 123, 300, 517]) {
      const states = engineState(crank, G);
      expect(states[0].dropFraction).toBeCloseTo(states[3].dropFraction, 6);
      expect(states[1].dropFraction).toBeCloseTo(states[2].dropFraction, 6);
    }
  });

  it('never has two cylinders on the power stroke simultaneously past TDC', () => {
    // Exactly one cylinder fires every 180 degrees of crank rotation.
    for (let crank = 0; crank < 720; crank += 7) {
      const firing = engineState(crank, G).filter((s) => s.stroke === 'Power');
      expect(firing).toHaveLength(1);
    }
  });

  it('gives every cylinder each stroke exactly once per cycle', () => {
    const seen = new Map<number, Set<string>>();
    for (let crank = 0; crank < 720; crank += 5) {
      for (const state of engineState(crank, G)) {
        if (!seen.has(state.number)) seen.set(state.number, new Set());
        seen.get(state.number)!.add(state.stroke);
      }
    }
    for (const strokes of seen.values()) {
      expect([...strokes].sort()).toEqual(['Compression', 'Exhaust', 'Intake', 'Power']);
    }
  });

  it('assigns plug A to cylinders 1 and 4, plug B to 2 and 3', () => {
    expect(CYLINDER_DESIGN).toEqual(['A', 'B', 'B', 'A']);
    const states = engineState(0, G);
    expect(states.filter((s) => s.design === 'A').map((s) => s.number)).toEqual([1, 4]);
    expect(states.filter((s) => s.design === 'B').map((s) => s.number)).toEqual([2, 3]);
  });

  it('wraps the cycle correctly for negative and large angles', () => {
    expect(wrapCycle(-90)).toBe(630);
    expect(wrapCycle(1440)).toBe(0);
    expect(wrapCycle(800)).toBe(80);
    expect(cylinderCycleAngle(2, 90)).toBe(wrapCycle(90 - 180));
  });

  it('labels strokes at the right boundaries', () => {
    expect(strokeAt(0)).toBe('Power');
    expect(strokeAt(179)).toBe('Power');
    expect(strokeAt(180)).toBe('Exhaust');
    expect(strokeAt(359)).toBe('Exhaust');
    expect(strokeAt(360)).toBe('Intake');
    expect(strokeAt(540)).toBe('Compression');
    expect(strokeAt(719)).toBe('Compression');
  });
});

describe('combustion envelope', () => {
  it('fires just before top dead centre, not at mid-stroke', () => {
    // Ignition advance means the kernel starts late in compression.
    expect(combustionIntensity(710)).toBeGreaterThan(0);
    expect(combustionIntensity(450)).toBe(0); // mid intake: nothing
    expect(combustionIntensity(270)).toBe(0); // mid exhaust: nothing
  });

  it('peaks shortly after top dead centre and then decays', () => {
    const justAfter = combustionIntensity(8);
    const later = combustionIntensity(90);
    const muchLater = combustionIntensity(145);
    expect(justAfter).toBeGreaterThan(0.5);
    expect(later).toBeLessThan(justAfter);
    expect(muchLater).toBeLessThan(later);
  });

  it('stays within [0, 1] across the whole cycle', () => {
    for (let deg = 0; deg < 720; deg += 1) {
      const value = combustionIntensity(deg);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('burns in exactly one cylinder at a time', () => {
    for (let crank = 0; crank < 720; crank += 11) {
      const burning = engineState(crank, G).filter((s) => s.combustion > 0.05);
      expect(burning.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('ignition rate and display sampling', () => {
  it('computes N/120 per cylinder for a four-stroke', () => {
    // 6000 rpm is 50 Hz per cylinder, 200 Hz across four.
    expect(ignitionHzPerCylinder(6000)).toBeCloseTo(50, 10);
    expect(ignitionHzPerCylinder(6000) * 4).toBeCloseTo(200, 10);
    expect(ignitionHzPerCylinder(3800)).toBeCloseTo(31.666, 2);
  });

  it('detects when a frame advances too much crank to render honestly', () => {
    // 6000 rpm at real time is 600 crank degrees in a 60 Hz frame: aliased.
    const realTime = crankDegreesPerFrame(6000, 1, 1 / 60);
    expect(realTime).toBeCloseTo(600, 6);
    expect(realTime).toBeGreaterThan(40);

    // Slowed 50x it becomes observable.
    const slow = crankDegreesPerFrame(6000, 0.02, 1 / 60);
    expect(slow).toBeCloseTo(12, 6);
    expect(slow).toBeLessThan(40);
  });
});

describe('tip colour ramp', () => {
  it('returns a parseable rgb colour across the range', () => {
    for (const t of [-50, 20, 300, 450, 650, 850, 1000, 1500]) {
      expect(tipColour(t)).toMatch(/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/);
    }
  });

  it('runs cool grey below the self-cleaning floor and hot above it', () => {
    const cold = tipColour(20);
    const window = tipColour(650);
    expect(cold).not.toBe(window);
    // In the operating window the red channel dominates the blue one.
    const [, r, , b] = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(window)!.map(Number) as unknown as number[];
    expect(r).toBeGreaterThan(b);
  });
});
