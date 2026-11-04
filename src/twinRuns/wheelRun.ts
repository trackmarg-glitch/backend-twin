/**
 * Analysis of a finished alloy-wheel twin run, from WheelSim's recorded history
 * (speed, wheel load and the highest spoke stress every 0.05 s) and its fatigue
 * damage counter. The stress model is the twin's reduced-order spoke load path;
 * the fatigue count ranks conditions, it is not a life prediction.
 */
import { findWheelMaterial } from '../modules/alloyWheel/wheel/materials.ts';
import type { WheelParams, WheelSample, WheelState } from '../modules/alloyWheel/sim/wheelModel.ts';
import { downsample, firstCrossing, fmtS, maxCheck, overall, peak } from './common.ts';
import type { RunAdvice, RunCheck, RunEvent, RunPoint, TwinRun } from './types.ts';

export const WHEEL_LIMITS = {
  /** Miner damage above this in one run is worth a look. */
  damageReview: 1e-3,
  /** Miner sum of 1 = predicted crack initiation. */
  damageFail: 1,
};

const SCENARIO_LABEL: Record<string, string> = {
  manual: 'Manual driving',
  cruise: 'Straight-line cruise',
  'brake-stop': 'Brake stop',
  cornering: 'Steady cornering',
  'handling-loop': 'Handling loop',
  'rig-cornering': 'Cornering fatigue rig',
  'rig-radial': 'Radial fatigue rig',
};

export interface WheelRunSource {
  params: WheelParams;
  state: WheelState;
  history: WheelSample[];
  lifeKm?: number;
}

export function buildWheelRun(sim: WheelRunSource): Omit<TwinRun, 'id' | 'createdAt'> {
  const p = sim.params;
  const h = sim.history;
  const mat = findWheelMaterial(p.materialId);
  const pts = (f: (s: WheelSample) => number): RunPoint[] => h.map((s) => ({ t: s.t, v: f(s) }));
  const stress = pts((s) => s.peakMPa);
  const speed = pts((s) => s.kmh);
  const load = pts((s) => s.FzkN);
  const fatigueLimit = h.length ? h[h.length - 1].limitMPa : sim.state.peakMPa;
  const pkS = peak(stress);
  const pkL = peak(load);
  const last = h[h.length - 1] ?? { t: sim.state.t, kmh: 0 };

  const checks: RunCheck[] = [
    maxCheck(
      {
        id: 'spoke-yield',
        label: 'Peak spoke stress vs yield',
        requirement: `< ${mat.yieldMPa} MPa (${mat.name} yield)`,
        value: pkS.v,
        unit: 'MPa',
        digits: 0,
        basis: 'estimated',
        why: 'If a spoke root passes yield, the wheel takes a permanent set.',
        after: 'Past yield the spoke bends permanently: the wheel runs out of true, and cracks start much sooner.',
      },
      stress,
      mat.yieldMPa * 0.8,
      mat.yieldMPa,
    ),
    maxCheck(
      {
        id: 'spoke-fatigue',
        label: 'Peak spoke stress vs fatigue limit',
        requirement: `< ${fatigueLimit.toFixed(0)} MPa (10⁷-cycle strength)`,
        value: pkS.v,
        unit: 'MPa',
        digits: 0,
        basis: 'estimated',
        why: 'Every wheel turn loads and unloads each spoke once. Above the fatigue limit, each turn uses up some life.',
        after: 'Above the fatigue limit, damage builds every revolution until a crack starts at the spoke root (Miner sum reaching 1).',
      },
      stress,
      fatigueLimit,
      fatigueLimit,
      'review',
    ),
    maxCheck(
      {
        id: 'damage',
        label: 'Fatigue damage used in this run',
        requirement: `< ${WHEEL_LIMITS.damageFail} (Miner sum)`,
        value: sim.state.damage,
        unit: '–',
        digits: 5,
        basis: 'estimated',
        why: 'Accumulated fatigue damage (Basquin + Goodman + Miner on illustrative constants). It ranks conditions; it is not a life prediction.',
        after: 'A Miner sum of 1 means a crack is predicted to start; well before that, inspection intervals shorten.',
      },
      null,
      WHEEL_LIMITS.damageReview,
      WHEEL_LIMITS.damageFail,
    ),
  ];

  const events: RunEvent[] = [];
  events.push({ t: pkL.t, severity: 'info', text: `Highest wheel load ${pkL.v.toFixed(2)} kN.` });
  events.push({ t: pkS.t, severity: pkS.v >= mat.yieldMPa ? 'fail' : pkS.v >= fatigueLimit ? 'review' : 'info', text: `Highest spoke stress ${pkS.v.toFixed(0)} MPa.` });
  const tFat = firstCrossing(stress, fatigueLimit);
  if (tFat !== null) events.push({ t: tFat, severity: 'review', text: `Spoke stress passed the ${fatigueLimit.toFixed(0)} MPa fatigue limit: each turn now uses life.` });
  const tYield = firstCrossing(stress, mat.yieldMPa);
  if (tYield !== null) events.push({ t: tYield, severity: 'fail', text: `Spoke stress passed yield (${mat.yieldMPa} MPa): permanent deformation.` });
  events.push({ t: last.t, severity: 'info', text: `Run ended at ${last.kmh.toFixed(0)} km/h after ${sim.state.revolutions.toFixed(0)} revolutions.` });
  events.sort((a, b) => a.t - b.t);

  const { verdict, counts } = overall(checks);
  const open = checks.filter((c) => c.status !== 'pass');
  const headline =
    verdict === 'pass'
      ? 'Wheel OK for this duty: spoke stress stayed below the fatigue limit.'
      : verdict === 'review'
        ? `Usable, but ${open.map((c) => c.label.toLowerCase()).join(', ')} need${open.length === 1 ? 's' : ''} review.`
        : `Not OK for this duty: ${checks.filter((c) => c.status === 'fail').map((c) => c.label.toLowerCase()).join(', ')}.`;

  const advice: RunAdvice[] = [];
  if (verdict !== 'pass') {
    advice.push({ text: 'Thicken or widen the spokes, or raise the blend radius at the spoke root, in the wheel Design Lab.', goTo: 'design-lab' });
    advice.push({ text: 'A stronger material (6061-T6 forged) raises both the yield and the fatigue limit.', goTo: 'design-lab' });
  } else advice.push({ text: 'Try a harsher duty (higher lateral g or a rig test) to find the margin.', goTo: 'digital-twin' });

  return {
    component: 'alloy-wheel',
    title: `${SCENARIO_LABEL[p.scenario] ?? p.scenario} · ${mat.name}`,
    scenario: SCENARIO_LABEL[p.scenario] ?? p.scenario,
    durationS: last.t,
    conditions: [
      { label: 'Scenario', value: SCENARIO_LABEL[p.scenario] ?? p.scenario },
      { label: 'Material', value: mat.name },
      { label: 'Cruise speed', value: `${p.targetSpeedKmh} km/h` },
      { label: 'Static wheel load', value: `${(p.staticLoadN / 1000).toFixed(2)} kN` },
    ],
    summary: [
      { label: 'Peak spoke stress', value: `${pkS.v.toFixed(0)} MPa at ${pkS.t.toFixed(1)} s` },
      { label: 'Fatigue limit', value: `${fatigueLimit.toFixed(0)} MPa` },
      { label: 'Yield', value: `${mat.yieldMPa} MPa` },
      { label: 'Peak wheel load', value: `${pkL.v.toFixed(2)} kN` },
      { label: 'Revolutions', value: sim.state.revolutions.toFixed(0) },
      { label: 'Fatigue damage', value: sim.state.damage.toExponential(2) },
      { label: 'First critical moment', value: fmtS(tYield) },
    ],
    series: [
      { key: 'stress', label: 'Highest spoke stress', unit: 'MPa', digits: 0, points: downsample(stress), review: fatigueLimit, reviewLabel: 'fatigue limit', fail: mat.yieldMPa, failLabel: 'yield' },
      { key: 'load', label: 'Wheel load', unit: 'kN', digits: 2, points: downsample(load) },
      { key: 'speed', label: 'Vehicle speed', unit: 'km/h', digits: 0, points: downsample(speed) },
    ],
    checks,
    events,
    verdict,
    counts,
    condition: {
      headline,
      lines: [
        `Damage used in this run: ${sim.state.damage.toExponential(2)} of a Miner sum of 1.`,
        sim.lifeKm !== undefined && Number.isFinite(sim.lifeKm) ? `At the final condition, the remaining life would be about ${Math.round(sim.lifeKm).toLocaleString()} km (ranking only).` : 'At the final condition the damage rate is about zero.',
      ],
    },
    advice,
    modelNote: 'Reduced-order spoke load path with illustrative fatigue constants. It ranks conditions; it is not a life prediction or FEA.',
  };
}
