// Checks for the twin-run analysis (run complete → verdict → full graphs). Run with: npm run test:twinrun
import { BrakeSim } from '../src/modules/brakeCaliper/sim/brakeModel.ts';
import { WheelSim } from '../src/modules/alloyWheel/sim/wheelModel.ts';
import { CALIPER_BASELINE, CALIPER_INPUT_DEFAULTS } from '../src/workspace/designs.ts';
import { buildBrakeRun } from '../src/twinRuns/brakeRun.ts';
import { buildWheelRun } from '../src/twinRuns/wheelRun.ts';
import { firstCrossing, overall } from '../src/twinRuns/common.ts';
import { TwinRunStore } from '../src/twinRuns/TwinRunStore.ts';
import type { TwinRun } from '../src/twinRuns/types.ts';

let failures = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failures++;
};
const ref = { design: CALIPER_BASELINE, inputs: CALIPER_INPUT_DEFAULTS };

function shape(run: Omit<TwinRun, 'id' | 'createdAt'>, label: string) {
  check(`${label}: has checks, series and events`, run.checks.length > 0 && run.series.length > 0 && run.events.length > 0);
  check(`${label}: series span the whole run`, run.series.every((s) => s.points.length >= 2 && Math.abs(s.points[s.points.length - 1].t - run.durationS) < 0.2), run.durationS.toFixed(2) + ' s');
  check(`${label}: series are downsampled`, run.series.every((s) => s.points.length <= 1000));
  check(`${label}: verdict is the worst check`, run.verdict === overall(run.checks).verdict);
  check(`${label}: counts add up`, run.counts.pass + run.counts.review + run.counts.fail === run.checks.length);
  check(`${label}: events in time order`, run.events.every((e, i) => i === 0 || e.t >= run.events[i - 1].t));
  check(`${label}: every open check has an after-effect`, run.checks.every((c) => c.after.length > 0 && c.why.length > 0));
  check(`${label}: has advice`, run.advice.length > 0);
}

// 1. firstCrossing interpolates.
{
  const t = firstCrossing([{ t: 0, v: 0 }, { t: 1, v: 10 }], 5);
  check('firstCrossing interpolates', t !== null && Math.abs(t - 0.5) < 1e-9, String(t));
  check('firstCrossing null when never crossed', firstCrossing([{ t: 0, v: 0 }, { t: 1, v: 1 }], 5) === null);
}

// 2. A gentle brake run passes.
{
  const sim = new BrakeSim({ scenario: 'single-stop', targetSpeedKmh: 60, pressureSetpointMPa: 3, durationS: 12 });
  sim.play();
  sim.advanceSim(13);
  check('gentle brake run finished', sim.state.finished);
  const run = buildBrakeRun(sim, ref);
  shape(run, 'gentle brake');
  const temp = run.checks.find((c) => c.id === 'rotor-temp')!;
  check('gentle brake: rotor temperature OK', temp.status === 'pass', temp.value.toFixed(0) + ' °C');
}

// 3. A hard, repeated-stop run goes critical, and the crossing time is reported.
{
  const sim = new BrakeSim({ scenario: 'repeated-stops', targetSpeedKmh: 200, pressureSetpointMPa: 12, durationS: 90 });
  sim.play();
  sim.advanceSim(91);
  const run = buildBrakeRun(sim, ref);
  shape(run, 'hard brake');
  check('hard brake: not a pass', run.verdict !== 'pass', run.verdict + ' · ' + run.condition.headline);
  const open = run.checks.filter((c) => c.status !== 'pass');
  check('hard brake: open checks carry first-crossing time', open.length > 0 && open.every((c) => c.firstAtS !== null && c.firstAtS <= run.durationS));
}

// 4. Wheel run.
{
  const sim = new WheelSim({ scenario: 'handling-loop', durationS: 30 } as never);
  sim.play();
  sim.advanceSim(sim.params.durationS + 1);
  check('wheel run finished', sim.state.finished);
  const run = buildWheelRun({ params: sim.params, state: sim.state, history: sim.history, lifeKm: sim.lifeKm });
  shape(run, 'wheel');
}

// 5. Store: newest first, capped, fresh + dismiss.
{
  const store = new TwinRunStore(false);
  const sim = new BrakeSim({ scenario: 'single-stop', durationS: 10 });
  sim.play();
  sim.advanceSim(11);
  const base = buildBrakeRun(sim, ref);
  let last: TwinRun | undefined;
  for (let i = 0; i < 15; i++) last = store.add(base);
  check('store caps at 12 runs', store.runs.length === 12);
  check('store newest first + fresh', store.runs[0].id === last!.id && store.fresh === last!.id);
  check('store get by id', store.get(last!.id) === store.runs[0]);
  store.dismiss();
  check('dismiss clears fresh but keeps the run', store.fresh === null && !!store.get(last!.id));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall twin-run checks passed');
process.exit(failures ? 1 : 0);
