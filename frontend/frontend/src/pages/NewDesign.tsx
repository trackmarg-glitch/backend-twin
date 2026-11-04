/** New Design — the guided wizard.
 *
 * The whole point of this page is that an engineer is never shown twenty fields
 * at once. Each step asks for one kind of thing, in the order the work is
 * actually done, and the step rail shows where you are and what is left.
 *
 * Step 3 is where the old interface failed worst, so it is grouped explicitly:
 * A Geometry, B Material, C Engineering conditions. Nothing irrelevant to the
 * chosen component appears. */

import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../components/Shell';
import {
  Empty,
  Metric,
  Note,
  Panel,
  SectionLabel,
  Seg,
  Source,
  Spin,
  StatusChip,
  fmt,
} from '../components/primitives';
import { Field, NumberInput, RangeField, toDisplay, unitOf } from '../wizard/fields';
import { ComponentViewport } from '../engine/ComponentViewport';
import { api, ApiValidationError } from '../services/api';
import { useStore, type WizardStep } from '../store/useStore';
import type { ComponentType, Profile, StudyRequest } from '../types/api';

const STEPS: Array<{ n: WizardStep; label: string; note: string }> = [
  { n: 1, label: 'Component', note: 'What are you designing' },
  { n: 2, label: 'Requirements', note: 'Describe it in words' },
  { n: 3, label: 'Parameters', note: 'Geometry, material, conditions' },
  { n: 4, label: 'Optimization', note: 'What to improve' },
  { n: 5, label: 'Generate', note: 'Build and simulate' },
];

const EXAMPLES: Record<ComponentType, string> = {
  alloy_wheel:
    'Generate a lightweight aluminium alloy wheel with high structural strength while ' +
    'maintaining the original mounting dimensions. It carries a 5200 N radial load, peak ' +
    'stress must stay below 110 MPa and deflection under 1.0 mm. Our casting process ' +
    'cannot go thinner than 7 mm walls.',
  brake_caliper:
    'Reduce the mass of this cast iron caliper body without losing stiffness. Line ' +
    'pressure reaches 11 MPa. Keep von Mises stress under 150 MPa and the caliper mouth ' +
    'opening below 0.18 mm. Minimum wall thickness for our casting is 8 mm.',
  spark_plug:
    'Keep the firing end between 450 C and 850 C so it self-cleans without pre-ignition. ' +
    'Combustion gas is around 950 C with a film coefficient of 550 W/(m2.K), and the ' +
    'cylinder head seat sits at 160 C.',
};

/* ------------------------------------------------------------ step rail */

function StepRail() {
  const store = useStore();
  return (
    <div className="rail-steps">
      {STEPS.map((step) => {
        const state =
          store.step === step.n ? 'current' : store.furthestStep >= step.n ? 'done' : '';
        return (
          <button
            key={step.n}
            className={`rail-step ${state}`}
            disabled={step.n > store.furthestStep}
            onClick={() => store.goToStep(step.n)}
          >
            <span className="rail-step-num">
              {store.furthestStep > step.n && store.step !== step.n
                ? '✓'
                : String(step.n).padStart(2, '0')}
            </span>
            <span>
              <span className="rail-step-label">{step.label}</span>
              <span className="rail-step-note" style={{ display: 'block' }}>
                {step.note}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- step 1 */

function Step1() {
  const store = useStore();
  return (
    <Panel title="Step 01 · Select component">
      <p className="sm faint" style={{ marginTop: 0 }}>
        Each component has its own geometry template, physics and limits. Only the fields
        that apply to your choice will be shown.
      </p>
      <div className="tile-grid" style={{ marginTop: 14 }}>
        {store.profiles.map((p) => (
          <button
            key={p.component_type}
            className="tile"
            style={{ padding: 18 }}
            onClick={() => store.chooseComponent(p.component_type)}
          >
            <div className="tile-name">{p.display_name}</div>
            <div className="tile-desc">{p.summary}</div>
            <div className="row" style={{ gap: 7, marginTop: 10 }}>
              <span className="chip chip-grey">
                {p.analysis_type.replace(/_/g, ' ')}
              </span>
            </div>
            <span className="tile-cta">Select →</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------------- step 2 */

function Step2({ profile }: { profile: Profile }) {
  const store = useStore();
  const draft = store.draft;

  return (
    <div className="col">
      <Panel title="Step 02 · Describe your design">
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          What do you want to engineer?
        </div>
        <p className="sm faint" style={{ marginTop: 0, marginBottom: 14 }}>
          Write it the way you would describe it to a colleague. The assistant pulls out
          the values you stated and tells you which ones are still missing — it will not
          invent a load, a limit or a material property you did not give it.
        </p>

        <textarea
          className="prompt-box"
          value={store.requirementText}
          placeholder={`Example: ${EXAMPLES[profile.component_type]}`}
          onChange={(e) => store.setRequirementText(e.target.value)}
        />

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            className="btn btn-sm"
            onClick={() => store.setRequirementText(EXAMPLES[profile.component_type])}
          >
            Use example
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void store.interpret()}
            disabled={store.interpreting || !store.requirementText.trim()}
          >
            {store.interpreting ? <Spin /> : '✦'} Interpret requirements with AI
          </button>
          <span className="grow" />
          <button className="btn btn-ghost btn-sm" onClick={() => store.nextStep()}>
            Skip — I'll enter values myself →
          </button>
        </div>
      </Panel>

      {draft && (
        <Panel
          title="What the assistant found"
          badge={
            <span className="chip chip-violet">
              {draft.parser === 'deterministic_offline' ? 'offline parser' : 'language model'}
            </span>
          }
        >
          {draft.extracted_values.length > 0 ? (
            <>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th className="n">Value</th>
                    <th>Taken from your text</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.extracted_values.map((v) => (
                    <tr key={v.key}>
                      <td className="t dim">
                        {profile.engineering_inputs.find((f) => f.key === v.key)?.label ?? v.key}
                      </td>
                      <td className="n">
                        {fmt(v.display_value)} <span className="faint">{v.display_unit}</span>
                      </td>
                      <td className="t faint">“{v.source_text}”</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 13 }}>
                <button className="btn btn-primary" onClick={() => { store.applyDraft(); store.nextStep(); }}>
                  Use these values and continue →
                </button>
                <span className="xs faint">
                  They are filled in for your review, marked <Source kind="ai" />. Nothing is confirmed.
                </span>
              </div>
            </>
          ) : (
            <Empty icon="◌">
              No values could be read from that description.
              <br />
              Enter them directly in the next step.
            </Empty>
          )}

          {draft.missing_fields.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <Note tone="amber">
                <strong>Still needed — these will not be invented</strong>
                <ul className="ul">
                  {draft.missing_fields.map((f) => (
                    <li key={f.field}>
                      {f.label}
                      {f.suggested_unit ? ` (${f.suggested_unit})` : ''} —{' '}
                      <span className="faint">{f.why_required}</span>
                    </li>
                  ))}
                </ul>
              </Note>
            </div>
          )}

          {draft.warnings.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <Note tone="plain">
                <ul className="ul xs">
                  {draft.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Note>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- step 3 */

function Step3({ profile }: { profile: Profile }) {
  const store = useStore();
  const material = profile.materials.find((m) => m.material_id === store.materialId);
  const thermal = profile.analysis_type === 'steady_state_thermal';

  const geometry = profile.parameters.filter((p) => p.is_design_variable);
  const preserved = profile.parameters.filter((p) => !p.is_design_variable);

  return (
    <div className="col">
      <Panel title="Step 03 · Engineering parameters">
        <p className="sm faint" style={{ marginTop: 0, marginBottom: 2 }}>
          Three groups: the shape, what it is made of, and what it has to survive. Only the
          fields that apply to a {profile.display_name.toLowerCase()} are shown.
        </p>
      </Panel>

      {/* ---------------------------------------------------- A. Geometry */}
      <Panel title="A · Geometry" badge={<span className="chip chip-grey">{geometry.length} adjustable</span>}>
        <div className="form-grid">
          {geometry.map((spec) => (
            <RangeField
              key={spec.name}
              spec={spec}
              value={store.parameters[spec.name] ?? spec.default}
              source={store.sources[spec.name] === 'you' ? 'you' : undefined}
              onChange={(v) => store.setParameter(spec.name, v)}
            />
          ))}
        </div>

        {preserved.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <SectionLabel>Protected interfaces — preserved, not optimised</SectionLabel>
            <div className="form-grid">
              {preserved.map((spec) => (
                <RangeField
                  key={spec.name}
                  spec={spec}
                  value={store.parameters[spec.name] ?? spec.default}
                  onChange={() => undefined}
                />
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* ---------------------------------------------------- B. Material */}
      <Panel title="B · Material">
        <div className="form-grid">
          <Field
            label={thermal ? 'Primary material' : 'Material selection'}
            source="catalog"
          >
            <div className="f-input">
              <select
                value={store.materialId ?? ''}
                onChange={(e) => store.setMaterial(e.target.value)}
              >
                {profile.materials.map((m) => (
                  <option key={m.material_id} value={m.material_id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          {Object.keys(store.materialAssignments).map((key) => (
            <Field key={key} label={`${key[0].toUpperCase()}${key.slice(1)} material`} source="catalog">
              <div className="f-input">
                <select
                  value={store.materialAssignments[key]}
                  onChange={(e) => store.setMaterialAssignment(key, e.target.value)}
                >
                  {profile.materials.map((m) => (
                    <option key={m.material_id} value={m.material_id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          ))}
        </div>

        {material && (
          <>
            <div style={{ marginTop: 16 }}>
              <SectionLabel>Properties used by the solver</SectionLabel>
            </div>
            <div className="metrics">
              <Metric label="Density" value={fmt(material.density)} unit="kg/m³" source="catalog" />
              {thermal ? (
                <Metric
                  label="Thermal conductivity"
                  value={material.thermal_conductivity != null ? fmt(material.thermal_conductivity) : '—'}
                  unit="W/(m·K)"
                  source="catalog"
                />
              ) : (
                <>
                  <Metric
                    label="Young's modulus"
                    value={material.elastic_modulus != null ? fmt(material.elastic_modulus / 1e9) : '—'}
                    unit="GPa"
                    source="catalog"
                  />
                  <Metric
                    label="Poisson's ratio"
                    value={material.poisson_ratio != null ? fmt(material.poisson_ratio) : '—'}
                    source="catalog"
                  />
                  <Metric
                    label="Yield strength"
                    value={material.yield_strength != null ? fmt(material.yield_strength / 1e6) : '—'}
                    unit="MPa"
                    source="catalog"
                    foot={
                      material.yield_strength == null ? (
                        <span className="xs faint">no yield point defined</span>
                      ) : undefined
                    }
                  />
                </>
              )}
            </div>

            <div style={{ marginTop: 13 }}>
              <Note tone="amber">
                Shipped material data is representative handbook-class values, not
                supplier-certified. Replace it with certified properties before any
                engineering sign-off.
                {material.notes && <div style={{ marginTop: 5 }}>{material.notes}</div>}
              </Note>
            </div>
          </>
        )}
      </Panel>

      {/* --------------------------------------- C. Engineering conditions */}
      <Panel
        title={thermal ? 'C · Thermal conditions' : 'C · Engineering conditions'}
        badge={
          store.missingConditions().length > 0 ? (
            <span className="chip chip-red">{store.missingConditions().length} missing</span>
          ) : (
            <span className="chip chip-green">complete</span>
          )
        }
      >
        <p className="sm faint" style={{ marginTop: 0, marginBottom: 14 }}>
          These are the values AutoTwin refuses to invent. Nothing will run until the
          required ones are supplied.
        </p>

        <div className="form-grid">
          {profile.engineering_inputs.map((field) => {
            const value = store.conditions[field.key];
            const source = store.sources[field.key];
            const missing = field.required && value === undefined;
            return (
              <Field
                key={field.key}
                label={field.label}
                tip={field.help_text}
                help={field.help_text}
                warn={missing ? field.why_required : undefined}
                source={
                  missing
                    ? 'missing'
                    : source === 'ai'
                      ? 'ai'
                      : source === 'demo'
                        ? 'estimate'
                        : value !== undefined
                          ? 'you'
                          : undefined
                }
              >
                <NumberInput
                  value={value ?? ''}
                  unit={field.unit}
                  missing={missing}
                  placeholder={field.required ? 'required' : 'optional'}
                  onChange={(v) => store.setCondition(field.key, v)}
                />
              </Field>
            );
          })}
        </div>

        {store.sources &&
          Object.values(store.sources).includes('demo') && (
            <div style={{ marginTop: 14 }}>
              <Note tone="amber">
                Values marked <Source kind="estimate" /> are labelled demonstration
                fixtures loaded as a starting point — not requirements from a
                specification. Replace them with your own engineering data.
              </Note>
            </div>
          )}
      </Panel>
    </div>
  );
}

/* --------------------------------------------------------------- step 4 */

function Step4({ profile }: { profile: Profile }) {
  const store = useStore();
  const requiring = profile.demo_assumptions.filter((a) => a.requires_confirmation);
  const variables = profile.parameters.filter((p) => p.is_design_variable);

  return (
    <div className="col">
      <Panel title="Step 04 · Optimization goals">
        <p className="sm faint" style={{ marginTop: 0, marginBottom: 14 }}>
          Pick what the search should improve. The first goal you select is treated as the
          primary one when ranking candidates; the rest shape the trade-off.
        </p>

        <div className="col-sm">
          {profile.objectives.map((objective) => {
            const id = String(objective.objective_id);
            const on = store.objectives.includes(id);
            return (
              <label key={id} className={`check ${on ? 'on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => store.toggleObjective(id)} />
                <span>
                  <span className="check-title">
                    {String(objective.label ?? id).replace(/_/g, ' ')}
                  </span>
                  <span className="check-note">
                    {String(objective.sense)} {String(objective.metric).replace(/_/g, ' ')}
                    {on && store.objectives[0] === id && (
                      <span className="chip chip-cyan" style={{ marginLeft: 8 }}>primary</span>
                    )}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {store.objectives.length === 0 && (
          <div style={{ marginTop: 12 }}>
            <Note tone="red">Choose at least one goal — there is nothing to optimise otherwise.</Note>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <Note tone="cyan">
            The search explores only the dimensions you allow, inside the ranges shown in
            Step 3, and a candidate counts as feasible only when every constraint you
            configured passes.
          </Note>
        </div>
      </Panel>

      <details>
        <summary className="sm dim" style={{ cursor: 'pointer', padding: '6px 0' }}>
          Advanced — which dimensions may vary, and search settings
        </summary>
        <div className="col" style={{ marginTop: 12 }}>
          <Panel title="Dimensions the optimizer may change">
            <div className="form-grid">
              {variables.map((spec) => {
                const on = store.designVariables.includes(spec.name);
                return (
                  <label key={spec.name} className={`check ${on ? 'on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => store.toggleDesignVariable(spec.name)}
                    />
                    <span>
                      <span className="check-title">{spec.label}</span>
                      <span className="check-note">
                        {toDisplay(spec, spec.minimum).toFixed(1)} –{' '}
                        {toDisplay(spec, spec.maximum).toFixed(1)} {unitOf(spec)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Panel>

          <Panel title="Search settings">
            <div className="form-grid">
              <Field label="Strategy">
                <div className="f-input">
                  <select
                    value={store.strategy}
                    onChange={(e) => store.setRunConfig({ strategy: e.target.value as 'doe' | 'nsga2' })}
                  >
                    <option value="doe">Design of experiments — map the space quickly</option>
                    <option value="nsga2">NSGA-II — drive to the feasible frontier</option>
                  </select>
                </div>
              </Field>

              {store.strategy === 'doe' ? (
                <Field label="Candidate budget" help="How many designs to build and solve.">
                  <NumberInput
                    value={store.candidateBudget}
                    unit="designs"
                    min={1}
                    max={40}
                    step={1}
                    onChange={(v) => store.setRunConfig({ candidateBudget: v ?? 7 })}
                  />
                </Field>
              ) : (
                <>
                  <Field label="Population">
                    <NumberInput
                      value={store.populationSize}
                      min={2}
                      max={24}
                      step={1}
                      onChange={(v) => store.setRunConfig({ populationSize: v ?? 6 })}
                    />
                  </Field>
                  <Field label="Generations">
                    <NumberInput
                      value={store.generations}
                      min={1}
                      max={12}
                      step={1}
                      onChange={(v) => store.setRunConfig({ generations: v ?? 3 })}
                    />
                  </Field>
                </>
              )}

              <Field
                label="Mesh fidelity"
                help={profile.mesh_presets.find((p) => p.key === store.meshPreset)?.description}
              >
                <div className="f-input">
                  <select
                    value={store.meshPreset}
                    onChange={(e) =>
                      store.setRunConfig({ meshPreset: e.target.value as typeof store.meshPreset })
                    }
                  >
                    {profile.mesh_presets.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label} — {p.target_element_size_mm} mm elements
                      </option>
                    ))}
                  </select>
                </div>
              </Field>

              <Field label="Random seed" help="The same seed reproduces the same candidate set.">
                <NumberInput
                  value={store.randomSeed}
                  step={1}
                  onChange={(v) => store.setRunConfig({ randomSeed: v ?? 20261102 })}
                />
              </Field>
            </div>
          </Panel>
        </div>
      </details>

      {requiring.length > 0 && (
        <Panel
          title="Assumptions this run depends on"
          badge={
            store.assumptionsAccepted ? (
              <span className="chip chip-green">accepted</span>
            ) : (
              <span className="chip chip-amber">review required</span>
            )
          }
        >
          {requiring.map((a) => (
            <div
              key={a.key}
              style={{
                padding: '10px 12px',
                marginBottom: 8,
                background: 'var(--sunken)',
                borderLeft: '2px solid var(--amber)',
                borderRadius: 6,
              }}
            >
              <div className="mono xs" style={{ color: 'var(--amber)', marginBottom: 4 }}>
                {a.key}
              </div>
              <div className="sm dim">{a.statement}</div>
            </div>
          ))}

          <label className={`check ${store.assumptionsAccepted ? 'on' : ''}`} style={{ marginTop: 6 }}>
            <input
              type="checkbox"
              checked={store.assumptionsAccepted}
              onChange={(e) => store.setAssumptionsAccepted(e.target.checked)}
            />
            <span className="check-title">
              I have read these {requiring.length} assumptions and accept that results
              computed from them are demonstration values, not validated engineering data.
            </span>
          </label>
        </Panel>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- step 5 */

function Step5({ profile }: { profile: Profile }) {
  const store = useStore();
  const navigate = useNavigate();
  const blockers = store.blockers();
  const job = store.activeJob;

  const estimateRows = useMemo(
    () => store.estimate?.metrics ?? [],
    [store.estimate],
  );

  const runtime = useMemo(() => {
    const per = store.meshPreset === 'screening' ? 30 : store.meshPreset === 'exploration' ? 48 : 130;
    const n =
      store.strategy === 'nsga2'
        ? store.populationSize * (store.generations + 1) + 1
        : store.candidateBudget + 1;
    const verify = store.verifyWinner && store.meshPreset !== 'verification' ? 130 : 0;
    return Math.round((n * per + verify) / 60);
  }, [store.strategy, store.candidateBudget, store.populationSize, store.generations, store.meshPreset, store.verifyWinner]);

  const generate = async () => {
    store.setRunError(null);
    store.setRunning(true);
    store.setStudy(null);
    try {
      const component = await store.ensureComponent();
      if (!component) throw new Error('Could not create the component record.');

      const request: StudyRequest = {
        component_instance_id: component.id,
        material_id: store.materialId ?? profile.materials[0].material_id,
        objective_summary: store.requirementText.trim() || profile.summary,
        engineering_inputs: store.conditions,
        parameters: store.parameters,
        design_variables: store.designVariables,
        objectives: store.objectives,
        strategy: store.strategy,
        candidate_budget: store.candidateBudget,
        population_size: store.populationSize,
        generations: store.generations,
        mesh_preset: store.meshPreset,
        verify_winner: store.verifyWinner,
        random_seed: store.randomSeed,
        time_budget_seconds: null,
        confirm_demo_assumptions: store.assumptionsAccepted,
      };

      const accepted = await api.startStudy(request);
      store.setJob({
        id: accepted.job_id,
        job_type: 'optimization',
        status: 'queued',
        stage: 'queued',
        progress: 0,
        stage_history: [],
        created_at: new Date().toISOString(),
        log_available: false,
      } as never);
    } catch (error) {
      store.setRunning(false);
      if (error instanceof ApiValidationError) {
        store.setRunError(
          [
            error.response.message,
            ...error.response.missing_fields.map((f) => `• ${f.label} is required`),
            ...error.response.errors.map((e) => `• ${e}`),
          ].join('\n'),
        );
      } else {
        store.setRunError((error as Error).message);
      }
    }
  };

  return (
    <div className="col">
      <div className="work">
        <div className="col">
          <ComponentViewport height={520} />

          {store.study && (
            <Panel title="Generated candidates" noBody>
              <div style={{ padding: 14 }}>
                <CandidateThumbs />
              </div>
            </Panel>
          )}
        </div>

        <div className="col">
          <Panel title="Ready to generate" badge={<span className="chip chip-grey">step 05</span>}>
            {blockers.length > 0 ? (
              <Note tone="amber">
                <strong>Before this can run</strong>
                <ul className="ul">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </Note>
            ) : (
              <Note tone="green">
                Everything required is supplied. {store.strategy === 'nsga2' ? 'NSGA-II' : 'A design of experiments'} will
                build, mesh and solve each candidate.
              </Note>
            )}

            <div className="row-sb sm" style={{ marginTop: 14 }}>
              <span className="faint">Designs to evaluate</span>
              <span className="mono">
                {store.strategy === 'nsga2'
                  ? store.populationSize * (store.generations + 1) + 1
                  : store.candidateBudget + 1}
              </span>
            </div>
            <div className="row-sb sm">
              <span className="faint">Estimated runtime</span>
              <span className="mono">~{runtime} min</span>
            </div>
            <div className="row-sb sm">
              <span className="faint">Mesh fidelity</span>
              <span className="mono">{store.meshPreset}</span>
            </div>

            <button
              className="btn btn-primary btn-hero btn-block"
              style={{ marginTop: 16 }}
              onClick={generate}
              disabled={store.running || blockers.length > 0}
            >
              {store.running ? (
                <>
                  <Spin /> Generating…
                </>
              ) : (
                'GENERATE DESIGN CANDIDATES'
              )}
            </button>

            <div className="xs faint" style={{ marginTop: 10, lineHeight: 1.6 }}>
              Each candidate is really built in CAD, meshed and solved. This is compute
              time, not a progress animation.
            </div>
          </Panel>

          {store.running && job && (
            <Panel title="Solver progress">
              <div className="row-sb" style={{ marginBottom: 8 }}>
                <span className="chip chip-cyan">{job.stage.replace(/_/g, ' ')}</span>
                <span className="mono sm">{Math.round((job.progress ?? 0) * 100)}%</span>
              </div>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${(job.progress ?? 0) * 100}%` }} />
              </div>
              <div className="sm dim" style={{ marginTop: 9 }}>{job.message ?? 'working…'}</div>
              <button
                className="btn btn-sm btn-ghost"
                style={{ marginTop: 11 }}
                onClick={() => void api.cancelJob(job.id)}
              >
                Cancel run
              </button>
            </Panel>
          )}

          {store.runError && (
            <Note tone="red">
              <strong>Run rejected</strong>
              <pre className="code" style={{ marginTop: 7, background: 'none', border: 0, padding: 0 }}>
                {store.runError}
              </pre>
            </Note>
          )}

          {store.study ? (
            <Panel title="Result" badge={<Source kind="solver" />}>
              <div className="metrics">
                <Metric label="Generated" value={store.study.summary.candidates_generated} />
                <Metric label="Solved" value={store.study.summary.candidates_evaluated} />
                <Metric
                  label="Feasible"
                  value={store.study.summary.candidates_feasible}
                  foot={<span className="xs faint">under your constraints</span>}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <Note tone={store.study.recommendation?.improves_on_baseline ? 'green' : 'amber'}>
                  {store.study.recommendation?.statement}
                </Note>
              </div>
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 12 }}
                onClick={() => navigate('/results')}
              >
                View simulation results →
              </button>
            </Panel>
          ) : (
            !store.running && (
              <Panel title="Live preview" badge={<Source kind="estimate" />}>
                {estimateRows.length === 0 ? (
                  <div className="sm faint">No estimate available.</div>
                ) : (
                  <>
                    {estimateRows.map((m) => (
                      <div className="row-sb sm" key={m.key} style={{ padding: '5px 0' }}>
                        <span className="faint">{m.label}</span>
                        <span className="mono">
                          {fmt(m.display_value)} <span className="faint">{m.display_unit}</span>
                        </span>
                      </div>
                    ))}
                    <div className="xs faint" style={{ marginTop: 10, lineHeight: 1.6 }}>
                      {store.estimate?.calibration_note}
                    </div>
                  </>
                )}
              </Panel>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/** Candidate thumbnails under the viewport. */
function CandidateThumbs() {
  const store = useStore();
  const study = store.study;
  if (!study) return null;

  const thermal = study.analysis_type === 'steady_state_thermal';
  const key = thermal ? 'max_temperature_k' : 'mass_kg';

  return (
    <div className="thumbs">
      {[...study.candidates]
        .sort((a, b) => (a.is_baseline ? -1 : b.is_baseline ? 1 : (a.rank ?? 99) - (b.rank ?? 99)))
        .map((c) => {
          const metric = c.display_metrics[key];
          return (
            <button
              key={c.candidate_id}
              className={`thumb ${c.candidate_id === store.selectedCandidateId ? 'on' : ''}`}
              onClick={() => store.selectCandidate(c.candidate_id)}
            >
              <div className="thumb-top">
                <span className="thumb-id">
                  {c.is_baseline ? 'BASE' : `#${String(c.index).padStart(2, '0')}`}
                </span>
                {c.candidate_id === study.recommended_candidate_id && (
                  <span className="chip chip-green" style={{ padding: '1px 5px' }}>★</span>
                )}
              </div>
              <div className="thumb-body">
                <div className="thumb-metric">
                  {metric ? `${fmt(metric.value)} ${metric.unit}` : '—'}
                </div>
                <div className="thumb-sub">
                  <StatusChip status={c.status} feasible={c.is_feasible} />
                </div>
              </div>
            </button>
          );
        })}
    </div>
  );
}

/* ------------------------------------------------------------- the page */

export function NewDesign() {
  const store = useStore();
  const profile = store.profile();

  // Land on step 1 when no component has been chosen yet.
  useEffect(() => {
    if (!profile && store.step !== 1) store.goToStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const canAdvance = (() => {
    if (store.step === 1) return Boolean(profile);
    if (store.step === 3) return store.missingConditions().length === 0;
    if (store.step === 4) return store.objectives.length > 0;
    return true;
  })();

  return (
    <>
      <PageHead
        title="New Design"
        context={
          profile ? (
            <>
              {profile.display_name} · {profile.analysis_type.replace(/_/g, ' ')} ·{' '}
              {profile.solver_name}
            </>
          ) : (
            'Choose a component to begin'
          )
        }
        actions={
          profile && (
            <div className="row">
              <Seg
                value={store.componentType as ComponentType}
                onChange={(v) => store.chooseComponent(v)}
                options={store.profiles.map((p) => ({
                  value: p.component_type,
                  label: p.display_name,
                }))}
              />
            </div>
          )
        }
      />

      <div className="main-body">
        <div style={{ display: 'grid', gridTemplateColumns: '186px minmax(0, 1fr)', gap: 22 }}>
          <div>
            <div className="section-label" style={{ marginTop: 0 }}>Progress</div>
            <StepRail />
          </div>

          <div className="col">
            {store.step === 1 && <Step1 />}
            {store.step === 2 && profile && <Step2 profile={profile} />}
            {store.step === 3 && profile && <Step3 profile={profile} />}
            {store.step === 4 && profile && <Step4 profile={profile} />}
            {store.step === 5 && profile && <Step5 profile={profile} />}

            {store.step > 1 && store.step < 5 && (
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <button className="btn btn-ghost" onClick={() => store.previousStep()}>
                  ← Back
                </button>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => store.nextStep()}
                  disabled={!canAdvance}
                  title={
                    !canAdvance
                      ? store.step === 3
                        ? 'Supply the required engineering conditions first'
                        : 'Choose at least one optimisation goal'
                      : undefined
                  }
                >
                  Continue →
                </button>
              </div>
            )}

            {store.step === 5 && (
              <div className="row">
                <button className="btn btn-ghost" onClick={() => store.previousStep()}>
                  ← Back to optimization goals
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
