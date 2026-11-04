/**
 * Analysis of a finished brake-twin run.
 *
 * Time series come straight from BrakeSim's recorded history (every 0.05 s of
 * simulated time). Caliper stress and mouth opening over time are the Design
 * Lab's beam estimate for candidate B, with the twin's piston bore and count,
 * evaluated at the run's line pressure at each moment (the estimate is linear
 * in pressure). Thresholds are demo limits, stated with every check.
 */
import { MODEL, rpmToKmh } from '../modules/brakeCaliper/sim/brakeModel.ts';
import type { BrakeParams, BrakeState, Sample } from '../modules/brakeCaliper/sim/brakeModel.ts';
import { caliperEstimate } from '../workspace/estimators.ts';
import type { CaliperDesign, CaliperInputs } from '../workspace/designs.ts';
import { downsample, firstCrossing, fmtS, maxCheck, overall, peak } from './common.ts';
import type { RunAdvice, RunCheck, RunEvent, RunPoint, RunSeries, TwinRun } from './types.ts';

/** Demo thresholds for a grey-iron rotor with typical organic pads. */
export const BRAKE_LIMITS = {
  /** Many pad compounds start to fade around here. */
  rotorReviewC: 450,
  /** Heat checking, distortion and fluid boiling become real risks. */
  rotorFailC: 650,
  /** Rotor heating faster than this is flagged as rapid heating. */
  heatRateReviewCps: 20,
  /** Stress and mouth opening within 20 % of their allowable need review. */
  structuralReviewFraction: 0.8,
};

export interface BrakeRunSource {
  params: BrakeParams;
  state: BrakeState;
  history: Sample[];
  pistonAreaPerSide: number;
}

export interface CaliperReference {
  /** Design Lab candidate B; its piston bore and count are replaced by the twin's. */
  design: CaliperDesign;
  inputs: CaliperInputs;
}

const SCENARIO_LABEL: Record<string, string> = {
  manual: 'Manual braking',
  'single-stop': 'Single stop',
  'repeated-stops': 'Repeated stops',
};

const pts = (h: Sample[], f: (s: Sample) => number): RunPoint[] => h.map((s) => ({ t: s.t, v: f(s) }));

/** Fastest rotor heating over any 0.5 s window, °C/s, and when it happened. */
function heatingRate(temp: RunPoint[]): RunPoint {
  let best: RunPoint = { t: 0, v: 0 };
  let j = 0;
  for (let i = 0; i < temp.length; i++) {
    while (j < i && temp[i].t - temp[j].t > 0.5) j++;
    const dt = temp[i].t - temp[j].t;
    if (dt >= 0.2) {
      const rate = (temp[i].v - temp[j].v) / dt;
      if (rate > best.v) best = { t: temp[i].t, v: rate };
    }
  }
  return best;
}

export function buildBrakeRun(sim: BrakeRunSource, ref: CaliperReference): Omit<TwinRun, 'id' | 'createdAt'> {
  const p = sim.params;
  const h = sim.history.length ? sim.history : [{ t: 0, rpm: 0, targetRpm: 0, pressure: 0, pressureCmd: 0, torque: 0, decel: 0, tempC: p.ambientC }];
  const design: CaliperDesign = { ...ref.design, pistonBoreMm: p.pistonDiaMm, pistonsPerSide: p.pistonsPerSide };
  const perMPa = caliperEstimate(design, { ...ref.inputs, linePressureMPa: 1 });
  const allowS = ref.inputs.allowableStressMPa;
  const allowM = ref.inputs.allowableMouthMm;
  const rf = BRAKE_LIMITS.structuralReviewFraction;

  const speed = pts(h, (s) => rpmToKmh(s.rpm, p.wheelRadius));
  const pressure = pts(h, (s) => s.pressure);
  const torque = pts(h, (s) => s.torque);
  const decel = pts(h, (s) => Math.max(0, s.decel) / MODEL.g);
  const temp = pts(h, (s) => s.tempC);
  const clamp = pts(h, (s) => (Math.max(0, s.pressure - MODEL.contactPressureMPa) * 1e6 * sim.pistonAreaPerSide) / 1000);
  const stress = pts(h, (s) => perMPa.peakStressMPa * s.pressure);
  const mouth = pts(h, (s) => perMPa.mouthOpeningMm * s.pressure);

  const pkT = peak(temp);
  const pkP = peak(pressure);
  const pkTorque = peak(torque);
  const pkDecel = peak(decel);
  const rate = heatingRate(temp);
  const gripTorque = p.roadMu * p.quarterMass * MODEL.g * p.wheelRadius;
  const gripSamples = h.filter((s) => s.torque >= gripTorque * 0.995 && s.torque > 0).length;
  const brakingSamples = h.filter((s) => s.torque > 0).length;
  let applications = 0;
  for (let i = 1; i < h.length; i++) if (h[i - 1].pressure < 0.5 && h[i].pressure >= 0.5) applications++;

  const checks: RunCheck[] = [
    maxCheck(
      {
        id: 'rotor-temp',
        label: 'Peak rotor temperature',
        requirement: `< ${BRAKE_LIMITS.rotorFailC} °C (review from ${BRAKE_LIMITS.rotorReviewC} °C)`,
        value: pkT.v,
        unit: '°C',
        digits: 0,
        basis: 'estimated',
        why: 'The rotor absorbs about 90 % of the braking energy. Its temperature sets pad friction, fluid temperature and the risk of cracking.',
        after: `Above about ${BRAKE_LIMITS.rotorReviewC} °C many pad compounds fade: friction drops, so the same pressure gives less torque and stops get longer (this model keeps pad μ constant, so a real stop would be worse than shown). Above about ${BRAKE_LIMITS.rotorFailC} °C a cast-iron rotor risks heat checking (surface cracks), distortion (judder) and boiling brake fluid in the caliper.`,
      },
      temp,
      BRAKE_LIMITS.rotorReviewC,
      BRAKE_LIMITS.rotorFailC,
    ),
    maxCheck(
      {
        id: 'heat-rate',
        label: 'Fastest rotor heating',
        requirement: `< ${BRAKE_LIMITS.heatRateReviewCps} °C/s`,
        value: rate.v,
        unit: '°C/s',
        digits: 1,
        basis: 'estimated',
        why: 'How fast the temperature climbs. A steep climb means the rotor cannot shed heat as fast as the brake puts it in.',
        after: 'Rapid heating gives large temperature differences through the rotor, the main cause of thermal stress, distortion and cracking.',
      },
      null,
      BRAKE_LIMITS.heatRateReviewCps,
      BRAKE_LIMITS.heatRateReviewCps,
      'review',
    ),
    maxCheck(
      {
        id: 'bridge-stress',
        label: 'Caliper bridge stress at peak pressure',
        requirement: `< ${allowS} MPa allowable`,
        value: pkP.v * perMPa.peakStressMPa,
        unit: 'MPa',
        digits: 1,
        basis: 'estimated',
        why: 'The clamp force pushes the caliper halves apart and bends the bridge. Estimated with the Design Lab candidate B body and this twin’s pistons.',
        after: 'Past the allowable the bridge can yield: the caliper mouth stays open, pedal travel grows and the caliper can crack under repeated stops.',
      },
      stress,
      allowS * rf,
      allowS,
    ),
    maxCheck(
      {
        id: 'mouth',
        label: 'Caliper mouth opening at peak pressure',
        requirement: `< ${allowM} mm allowable`,
        value: pkP.v * perMPa.mouthOpeningMm,
        unit: 'mm',
        digits: 3,
        basis: 'estimated',
        why: 'How far the caliper spreads under the clamp load.',
        after: 'A wide-open mouth wastes piston travel: a long, soft pedal and uneven, tapered pad wear.',
      },
      mouth,
      allowM * rf,
      allowM,
    ),
    maxCheck(
      {
        id: 'pressure',
        label: 'Peak line pressure vs design load case',
        requirement: `≤ ${ref.inputs.linePressureMPa} MPa design pressure`,
        value: pkP.v,
        unit: 'MPa',
        digits: 2,
        basis: 'model',
        why: 'The caliper is sized for its design load case (Design Lab limits). Running above it eats into every structural margin.',
        after: 'Above the design pressure the structural margins shrink in proportion; seals and hoses also see loads they were not sized for.',
      },
      pressure,
      ref.inputs.linePressureMPa + 1e-9,
      ref.inputs.linePressureMPa + 1e-9,
      'review',
    ),
  ];

  const events: RunEvent[] = [];
  const firstApply = firstCrossing(pressure, 0.5);
  if (firstApply !== null) events.push({ t: firstApply, severity: 'info', text: `Brake applied${applications > 1 ? ` (first of ${applications} applications)` : ''}.` });
  if (pkP.v > 0) events.push({ t: pkP.t, severity: 'info', text: `Peak line pressure ${pkP.v.toFixed(2)} MPa; clamp ${peak(clamp).v.toFixed(1)} kN per side.` });
  const gripAt = h.find((s) => s.torque >= gripTorque * 0.995 && s.torque > 0);
  if (gripAt) events.push({ t: gripAt.t, severity: 'review', text: `Tyre grip limit reached: torque capped at ${gripTorque.toFixed(0)} N·m; more pressure adds heat and load but no extra stopping.` });
  const tReview = firstCrossing(temp, BRAKE_LIMITS.rotorReviewC);
  if (tReview !== null) events.push({ t: tReview, severity: 'review', text: `Rotor passed ${BRAKE_LIMITS.rotorReviewC} °C: pad fade risk begins.` });
  const tFail = firstCrossing(temp, BRAKE_LIMITS.rotorFailC);
  if (tFail !== null) events.push({ t: tFail, severity: 'fail', text: `Rotor passed ${BRAKE_LIMITS.rotorFailC} °C: critical, heat-cracking and fluid-boiling risk.` });
  if (rate.v >= BRAKE_LIMITS.heatRateReviewCps) events.push({ t: rate.t, severity: 'review', text: `Temperature climbing at ${rate.v.toFixed(1)} °C/s, the steepest point of the run.` });
  const sCross = firstCrossing(stress, allowS);
  if (sCross !== null) events.push({ t: sCross, severity: 'fail', text: `Bridge stress passed the ${allowS} MPa allowable (estimate).` });
  const mCross = firstCrossing(mouth, allowM);
  if (mCross !== null) events.push({ t: mCross, severity: 'fail', text: `Mouth opening passed the ${allowM} mm allowable (estimate).` });
  const last = h[h.length - 1];
  events.push({ t: last.t, severity: 'info', text: `Run ended at ${rpmToKmh(last.rpm, p.wheelRadius).toFixed(0)} km/h with the rotor at ${last.tempC.toFixed(0)} °C.` });
  events.sort((a, b) => a.t - b.t);

  const { verdict, counts } = overall(checks);
  const byId = (id: string) => checks.find((c) => c.id === id)!;
  const open = checks.filter((c) => c.status !== 'pass');

  const headline =
    verdict === 'pass'
      ? 'Component OK for this duty: every check stayed inside its limit.'
      : verdict === 'review'
        ? `Usable, but close to the limits: ${open.map((c) => c.label.toLowerCase()).join(', ')} need${open.length === 1 ? 's' : ''} review.`
        : `Not OK for this duty: ${checks.filter((c) => c.status === 'fail').map((c) => c.label.toLowerCase()).join(', ')} went past the limit.`;
  const lines = [
    `Rotor ended at ${last.tempC.toFixed(0)} °C (peak ${pkT.v.toFixed(0)} °C at ${pkT.t.toFixed(1)} s, ambient ${p.ambientC} °C)${last.tempC > 300 ? '; let it cool before the next test' : ''}.`,
    `Caliper body at the peak pressure (${pkP.v.toFixed(2)} MPa): bridge stress about ${byId('bridge-stress').value.toFixed(0)} MPa, mouth opening ${byId('mouth').value.toFixed(3)} mm, factor of safety on yield about ${(pkP.v > 0 ? (perMPa.factorOfSafety / pkP.v) : Infinity).toFixed(2)}.`,
    brakingSamples ? `The tyre grip limit capped the torque for ${((100 * gripSamples) / brakingSamples).toFixed(0)} % of the braking time.` : 'The brake was not applied in this run.',
  ];

  const advice: RunAdvice[] = [];
  if (byId('rotor-temp').status !== 'pass' || byId('heat-rate').status !== 'pass') {
    advice.push({ text: 'Lower the line pressure or space the stops further apart, so the rotor can shed heat between applications.', goTo: 'digital-twin' });
    advice.push({ text: 'More rotor thermal mass (a larger or thicker vented rotor) would heat less per stop. The rotor is fixed in this twin, so treat this as a design direction.' });
  }
  if (byId('bridge-stress').status !== 'pass' || byId('mouth').status !== 'pass') {
    advice.push({ text: 'Stiffen candidate B in the Design Lab (bridge thickness or ribs). AI Insights can find the smallest change that clears the check.', goTo: 'design-lab' });
  }
  if (gripSamples > 0) {
    const pGrip = gripTorque / (2 * p.padMu * sim.pistonAreaPerSide * p.rotorEffRadius) / 1e6 + MODEL.contactPressureMPa;
    advice.push({ text: `Pressure above about ${pGrip.toFixed(1)} MPa adds no stopping at this grip; staying below it gives the same stop with less heat and load.`, goTo: 'digital-twin' });
  }
  if (byId('pressure').status !== 'pass') advice.push({ text: 'Either run at or below the design pressure, or raise the design load case in the Design Lab and re-check the caliper.', goTo: 'design-lab' });
  if (!advice.length) advice.push({ text: 'Try a harder duty to find the margin: higher speed, the repeated-stops scenario or a longer run.', goTo: 'digital-twin' });

  return {
    component: 'brake-caliper',
    title: `${SCENARIO_LABEL[p.scenario] ?? p.scenario} · ${p.targetSpeedKmh} km/h · ${p.pressureSetpointMPa} MPa`,
    scenario: SCENARIO_LABEL[p.scenario] ?? p.scenario,
    durationS: last.t,
    conditions: [
      { label: 'Scenario', value: SCENARIO_LABEL[p.scenario] ?? p.scenario },
      { label: 'Target speed', value: `${p.targetSpeedKmh} km/h` },
      { label: 'Line pressure setpoint', value: `${p.pressureSetpointMPa} MPa` },
      { label: 'Pistons', value: `${p.pistonsPerSide} × Ø${p.pistonDiaMm} mm per side` },
      { label: 'Pad / road μ', value: `${p.padMu} / ${p.roadMu}` },
      { label: 'Mass on the wheel', value: `${p.quarterMass} kg` },
      { label: 'Caliper body (estimate)', value: `${ref.design.revision} (Design Lab B)` },
    ],
    summary: [
      { label: 'Peak rotor temperature', value: `${pkT.v.toFixed(0)} °C` },
      { label: 'Rotor at the end', value: `${last.tempC.toFixed(0)} °C` },
      { label: 'Peak line pressure', value: `${pkP.v.toFixed(2)} MPa` },
      { label: 'Peak brake torque', value: `${pkTorque.v.toFixed(0)} N·m` },
      { label: 'Peak deceleration', value: `${pkDecel.v.toFixed(2)} g` },
      { label: 'Energy into heat', value: `${(sim.state.energyJ / 1e6).toFixed(2)} MJ` },
      { label: 'Brake applications', value: String(applications) },
      { label: 'First critical moment', value: fmtS(tFail ?? sCross ?? mCross) },
    ],
    series: [
      { key: 'temp', label: 'Rotor temperature', unit: '°C', digits: 0, points: downsample(temp), review: BRAKE_LIMITS.rotorReviewC, reviewLabel: 'pad fade risk', fail: BRAKE_LIMITS.rotorFailC, failLabel: 'critical' },
      { key: 'pressure', label: 'Line pressure', unit: 'MPa', digits: 2, points: downsample(pressure), review: ref.inputs.linePressureMPa, reviewLabel: 'design pressure' },
      { key: 'stress', label: 'Bridge stress (estimate)', unit: 'MPa', digits: 1, points: downsample(stress), review: allowS * rf, reviewLabel: 'near allowable', fail: allowS, failLabel: 'allowable' },
      { key: 'mouth', label: 'Mouth opening (estimate)', unit: 'mm', digits: 3, points: downsample(mouth), review: allowM * rf, reviewLabel: 'near allowable', fail: allowM, failLabel: 'allowable' },
      { key: 'torque', label: 'Brake torque', unit: 'N·m', digits: 0, points: downsample(torque), review: gripTorque, reviewLabel: 'tyre grip limit' },
      { key: 'clamp', label: 'Clamp force per side', unit: 'kN', digits: 1, points: downsample(clamp) },
      { key: 'speed', label: 'Vehicle speed', unit: 'km/h', digits: 0, points: downsample(speed) },
      { key: 'decel', label: 'Deceleration', unit: 'g', digits: 2, points: downsample(decel) },
    ],
    checks,
    events,
    verdict,
    counts,
    condition: { headline, lines },
    advice,
    modelNote:
      'Simplified brake dynamics (lumped rotor temperature, constant pad μ, ideal ABS) and a reduced-order caliper beam estimate, checked against demo limits. Not a test or FEA result.',
  };
}

export { firstCrossing };
