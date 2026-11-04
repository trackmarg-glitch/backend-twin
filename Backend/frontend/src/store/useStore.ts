/** Application state.
 *
 * One working design at a time. Comparison comes from the solver run — the
 * baseline it evaluates is the original, the candidates are the optimised
 * alternatives — so there is no second design to configure before you have
 * made the first.
 *
 * Nothing here derives an engineering value. Estimates arrive from the backend
 * already tagged; solver results are stored exactly as returned; a metric the
 * solver did not produce stays absent rather than becoming zero. */

import { create } from 'zustand';
import { api } from '../services/api';
import type {
  Candidate,
  Capabilities,
  ComponentInstance,
  ComponentType,
  EstimateResult,
  Explanation,
  Job,
  Profile,
  Project,
  RequirementDraft,
  StudyResult,
  VisualizationPayload,
} from '../types/api';

/** Where a value in the parameter form came from. */
export type ValueSource = 'default' | 'you' | 'ai' | 'demo';

export type WizardStep = 1 | 2 | 3 | 4 | 5;

interface State {
  backendOnline: boolean | null;
  backendError: string | null;
  capabilities: Capabilities | null;

  profiles: Profile[];
  componentType: ComponentType | null;

  activeProject: Project | null;
  activeComponent: ComponentInstance | null;
  creatingComponent: boolean;

  /* ---- wizard ---- */
  step: WizardStep;
  furthestStep: WizardStep;

  /** Free-text requirement and what the assistant drew from it. */
  requirementText: string;
  draft: RequirementDraft | null;
  interpreting: boolean;

  /** Geometry parameters, canonical SI. */
  parameters: Record<string, number>;
  /** Engineering conditions, in each field's declared display unit. */
  conditions: Record<string, number>;
  /** Provenance of each entered value, so the UI never implies confirmation. */
  sources: Record<string, ValueSource>;

  materialId: string | null;
  materialAssignments: Record<string, string>;

  objectives: string[];
  designVariables: string[];
  assumptionsAccepted: boolean;

  /* ---- run configuration ---- */
  strategy: 'doe' | 'nsga2';
  candidateBudget: number;
  populationSize: number;
  generations: number;
  meshPreset: 'screening' | 'exploration' | 'verification';
  verifyWinner: boolean;
  randomSeed: number;

  /* ---- live estimate ---- */
  estimate: EstimateResult | null;
  estimating: boolean;

  /* ---- animation ---- */
  animating: boolean;
  rpm: number;
  timeScale: number;

  /* ---- run ---- */
  activeJob: Job | null;
  running: boolean;
  runError: string | null;

  /* ---- results ---- */
  study: StudyResult | null;
  selectedCandidateId: string | null;
  visualization: VisualizationPayload | null;
  explanation: Explanation | null;

  /* ---- improve-existing ---- */
  importedMeta: Record<string, unknown> | null;
  importError: string | null;

  toast: string | null;
}

interface Actions {
  setBackend: (online: boolean, error?: string | null) => void;
  setCapabilities: (c: Capabilities | null) => void;
  setProfiles: (p: Profile[]) => void;

  chooseComponent: (t: ComponentType) => void;
  resetWizard: () => void;
  goToStep: (s: WizardStep) => void;
  nextStep: () => void;
  previousStep: () => void;

  setRequirementText: (t: string) => void;
  interpret: () => Promise<void>;
  applyDraft: () => void;

  setParameter: (name: string, value: number, source?: ValueSource) => void;
  setCondition: (key: string, value: number | null, source?: ValueSource) => void;
  setMaterial: (id: string) => void;
  setMaterialAssignment: (key: string, id: string) => void;
  resetParameters: () => void;

  toggleObjective: (id: string) => void;
  toggleDesignVariable: (name: string) => void;
  setAssumptionsAccepted: (v: boolean) => void;
  setRunConfig: (patch: Partial<State>) => void;

  setAnimating: (v: boolean) => void;
  setRpm: (v: number) => void;
  setTimeScale: (v: number) => void;

  refreshEstimate: () => Promise<void>;

  ensureComponent: () => Promise<ComponentInstance | null>;
  setJob: (j: Job | null) => void;
  setRunning: (v: boolean) => void;
  setRunError: (e: string | null) => void;

  setStudy: (s: StudyResult | null) => void;
  selectCandidate: (id: string | null) => void;
  setVisualization: (v: VisualizationPayload | null) => void;
  setExplanation: (e: Explanation | null) => void;

  setImported: (meta: Record<string, unknown> | null, error?: string | null) => void;
  setToast: (t: string | null) => void;

  profile: () => Profile | null;
  selectedCandidate: () => Candidate | null;
  baselineCandidate: () => Candidate | null;
  /** Required conditions the user has not supplied. */
  missingConditions: () => Array<{ key: string; label: string; unit: string }>;
  /** Everything blocking a solver run, as sentences. */
  blockers: () => string[];
  tipTemperatures: () => { A: number | null; B: number | null };
}

const BASE: State = {
  backendOnline: null,
  backendError: null,
  capabilities: null,

  profiles: [],
  componentType: null,

  activeProject: null,
  activeComponent: null,
  creatingComponent: false,

  step: 1,
  furthestStep: 1,

  requirementText: '',
  draft: null,
  interpreting: false,

  parameters: {},
  conditions: {},
  sources: {},

  materialId: null,
  materialAssignments: {},

  objectives: [],
  designVariables: [],
  assumptionsAccepted: false,

  strategy: 'doe',
  candidateBudget: 7,
  populationSize: 6,
  generations: 3,
  meshPreset: 'exploration',
  verifyWinner: true,
  randomSeed: 20261102,

  estimate: null,
  estimating: false,

  animating: true,
  rpm: 6000,
  timeScale: 0.02,

  activeJob: null,
  running: false,
  runError: null,

  study: null,
  selectedCandidateId: null,
  visualization: null,
  explanation: null,

  importedMeta: null,
  importError: null,

  toast: null,
};

let estimateTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<State & Actions>((set, get) => ({
  ...BASE,

  setBackend: (online, error = null) => set({ backendOnline: online, backendError: error }),
  setCapabilities: (capabilities) => set({ capabilities }),
  setProfiles: (profiles) => set({ profiles }),

  chooseComponent: (componentType) => {
    const profile = get().profiles.find((p) => p.component_type === componentType);
    if (!profile) return;

    const parameters: Record<string, number> = {};
    for (const spec of profile.parameters) parameters[spec.name] = spec.default;

    // Demo fixtures load as *starting points*, each tagged as such. They are
    // never treated as confirmed requirements.
    const conditions: Record<string, number> = {};
    const sources: Record<string, ValueSource> = {};
    for (const field of profile.engineering_inputs) {
      if (field.demo_default_display !== null && field.demo_default_display !== undefined) {
        conditions[field.key] = field.demo_default_display;
        sources[field.key] = 'demo';
      }
    }

    set({
      componentType,
      activeComponent: null,
      parameters,
      conditions,
      sources,
      materialId: profile.materials[0]?.material_id ?? null,
      materialAssignments: { ...profile.material_assignments },
      objectives: profile.objectives.map((o) => String(o.objective_id)),
      designVariables: [...profile.design_variables],
      assumptionsAccepted: false,
      estimate: null,
      study: null,
      selectedCandidateId: null,
      visualization: null,
      explanation: null,
      activeJob: null,
      runError: null,
      draft: null,
      requirementText: '',
      step: 2,
      furthestStep: 2,
    });
    void get().refreshEstimate();
  },

  resetWizard: () => set({ ...BASE, profiles: get().profiles, capabilities: get().capabilities, backendOnline: get().backendOnline }),

  goToStep: (step) => set({ step, furthestStep: Math.max(get().furthestStep, step) as WizardStep }),
  nextStep: () => {
    const next = Math.min(5, get().step + 1) as WizardStep;
    set({ step: next, furthestStep: Math.max(get().furthestStep, next) as WizardStep });
  },
  previousStep: () => set({ step: Math.max(1, get().step - 1) as WizardStep }),

  setRequirementText: (requirementText) => set({ requirementText }),

  interpret: async () => {
    const { requirementText, componentType } = get();
    if (!requirementText.trim()) return;
    set({ interpreting: true, draft: null });
    try {
      set({ draft: await api.interpret(requirementText, componentType ?? undefined) });
    } catch (error) {
      set({ toast: `Could not interpret that: ${(error as Error).message}` });
    } finally {
      set({ interpreting: false });
    }
  },

  /** Fill the form from the draft. Values stay editable and tagged as AI. */
  applyDraft: () => {
    const { draft, profile } = get();
    const p = profile();
    if (!draft || !p) return;

    const conditions = { ...get().conditions };
    const sources = { ...get().sources };
    let applied = 0;

    for (const value of draft.extracted_values) {
      const field = p.engineering_inputs.find((f) => f.key === value.key);
      if (!field) continue;
      if (field.unit === value.display_unit) {
        conditions[value.key] = value.display_value;
        sources[value.key] = 'ai';
        applied += 1;
      }
    }

    set({
      conditions,
      sources,
      materialId: draft.material_id ?? get().materialId,
      toast:
        applied > 0
          ? `${applied} value(s) filled from your description. Review each one — nothing is confirmed.`
          : 'Nothing could be filled from that description.',
    });
    void get().refreshEstimate();
  },

  setParameter: (name, value, source = 'you') => {
    set((s) => ({
      parameters: { ...s.parameters, [name]: value },
      sources: { ...s.sources, [name]: source },
    }));
    void get().refreshEstimate();
  },

  setCondition: (key, value, source = 'you') => {
    set((s) => {
      const conditions = { ...s.conditions };
      const sources = { ...s.sources };
      if (value === null || Number.isNaN(value)) {
        delete conditions[key];
        delete sources[key];
      } else {
        conditions[key] = value;
        sources[key] = source;
      }
      return { conditions, sources };
    });
    void get().refreshEstimate();
  },

  setMaterial: (materialId) => {
    set({ materialId });
    void get().refreshEstimate();
  },

  setMaterialAssignment: (key, id) => {
    set((s) => ({ materialAssignments: { ...s.materialAssignments, [key]: id } }));
    void get().refreshEstimate();
  },

  resetParameters: () => {
    const p = get().profile();
    if (!p) return;
    const parameters: Record<string, number> = {};
    for (const spec of p.parameters) parameters[spec.name] = spec.default;
    set({ parameters });
    void get().refreshEstimate();
  },

  toggleObjective: (id) =>
    set((s) => ({
      objectives: s.objectives.includes(id)
        ? s.objectives.filter((o) => o !== id)
        : [...s.objectives, id],
    })),

  toggleDesignVariable: (name) =>
    set((s) => ({
      designVariables: s.designVariables.includes(name)
        ? s.designVariables.filter((n) => n !== name)
        : [...s.designVariables, name],
    })),

  setAssumptionsAccepted: (assumptionsAccepted) => set({ assumptionsAccepted }),
  setRunConfig: (patch) => set(patch as Partial<State & Actions>),

  setAnimating: (animating) => set({ animating }),
  setRpm: (rpm) => set({ rpm }),
  setTimeScale: (timeScale) => set({ timeScale }),

  /** Debounced so dragging a slider does not flood the backend. */
  refreshEstimate: async () => {
    if (estimateTimer) clearTimeout(estimateTimer);
    await new Promise<void>((resolve) => {
      estimateTimer = setTimeout(resolve, 90);
    });

    const state = get();
    const profile = state.profile();
    if (!profile) return;

    set({ estimating: true });
    try {
      const estimate = await api.estimatePreview({
        component_type: profile.component_type,
        parameters: state.parameters,
        engineering_inputs: state.conditions,
        material_id: state.materialId,
        material_assignments: state.materialAssignments,
      });
      set({ estimate });
    } catch {
      // A failed estimate must never block the page; the solver is the
      // authoritative path and the UI simply shows no estimate.
      set({ estimate: null });
    } finally {
      set({ estimating: false });
    }
  },

  ensureComponent: async () => {
    const state = get();
    if (state.activeComponent) return state.activeComponent;
    const profile = state.profile();
    if (!profile) return null;

    set({ creatingComponent: true });
    try {
      let project = state.activeProject;
      if (!project) {
        project = await api.createProject(`${profile.display_name} study`);
        set({ activeProject: project });
      }
      const component = await api.createComponent({
        project_id: project.id,
        component_type: profile.component_type,
        design_mode: 'generate_new',
        name: `${profile.display_name} design`,
      });
      set({ activeComponent: component });
      return component;
    } finally {
      set({ creatingComponent: false });
    }
  },

  setJob: (activeJob) => set({ activeJob }),
  setRunning: (running) => set({ running }),
  setRunError: (runError) => set({ runError }),

  setStudy: (study) => {
    if (!study) {
      set({ study: null, selectedCandidateId: null, visualization: null, explanation: null });
      return;
    }
    const preferred =
      study.recommended_candidate_id ??
      study.baseline_candidate_id ??
      study.candidates.find((c) => c.evaluated)?.candidate_id ??
      null;
    set({ study, selectedCandidateId: preferred, explanation: null });
  },

  selectCandidate: (selectedCandidateId) =>
    set({ selectedCandidateId, visualization: null, explanation: null }),
  setVisualization: (visualization) => set({ visualization }),
  setExplanation: (explanation) => set({ explanation }),

  setImported: (importedMeta, importError = null) => set({ importedMeta, importError }),
  setToast: (toast) => set({ toast }),

  profile: () => {
    const { profiles, componentType } = get();
    if (!componentType) return null;
    return profiles.find((p) => p.component_type === componentType) ?? null;
  },

  selectedCandidate: () => {
    const { study, selectedCandidateId } = get();
    if (!study || !selectedCandidateId) return null;
    return study.candidates.find((c) => c.candidate_id === selectedCandidateId) ?? null;
  },

  baselineCandidate: () => get().study?.candidates.find((c) => c.is_baseline) ?? null,

  missingConditions: () => {
    const profile = get().profile();
    if (!profile) return [];
    const { conditions } = get();
    return profile.engineering_inputs
      .filter((f) => f.required && conditions[f.key] === undefined)
      .map((f) => ({ key: f.key, label: f.label, unit: f.unit }));
  },

  blockers: () => {
    const state = get();
    const profile = state.profile();
    if (!profile) return ['Choose a component.'];

    const out: string[] = [];
    const missing = state.missingConditions();
    if (missing.length) {
      out.push(`Supply ${missing.map((m) => m.label).join(', ')} in Engineering conditions.`);
    }
    const requiring = profile.demo_assumptions.filter((a) => a.requires_confirmation);
    if (requiring.length && !state.assumptionsAccepted) {
      out.push(`Review and accept the ${requiring.length} labelled assumptions.`);
    }
    if (state.objectives.length === 0) out.push('Choose at least one optimisation goal.');
    if (state.designVariables.length === 0) {
      out.push('Allow at least one dimension to be varied.');
    }
    return out;
  },

  tipTemperatures: () => {
    const { estimate, study } = get();
    const read = (candidate: Candidate | undefined) => {
      const kelvin = candidate?.metrics?.max_temperature_k;
      return typeof kelvin === 'number' ? kelvin - 273.15 : null;
    };

    if (study) {
      const baseline = study.candidates.find((c) => c.is_baseline);
      const best = study.candidates.find(
        (c) => c.candidate_id === study.recommended_candidate_id,
      );
      const a = read(baseline);
      if (a !== null) return { A: a, B: read(best) ?? a };
    }

    const metric = estimate?.metrics.find((m) => m.key === 'max_temperature_k');
    const value = metric ? metric.display_value : null;
    return { A: value, B: value };
  },
}));
