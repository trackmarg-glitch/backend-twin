/** TypeScript mirrors of the backend Pydantic contracts.
 *
 * Numbers are canonical SI unless the field name or a `DisplayValue` says
 * otherwise. Anything optional is optional because the backend genuinely may
 * not have computed it, and the UI must render that as "not available" rather
 * than as a zero. */

export type ComponentType = 'alloy_wheel' | 'brake_caliper' | 'spark_plug';
export type DesignMode = 'improve_existing' | 'generate_new';
export type AnalysisType =
  | 'linear_static_structural'
  | 'steady_state_thermal'
  | 'reduced_order_thermal';

export type CandidateStatus =
  | 'pending'
  | 'geometry_valid'
  | 'geometry_invalid'
  | 'meshed'
  | 'mesh_failed'
  | 'solved'
  | 'solver_failed'
  | 'feasible'
  | 'infeasible';

export type SourceStatus =
  | 'user_supplied'
  | 'official_problem_statement'
  | 'supplier_certified'
  | 'illustrative_handbook_value'
  | 'demo_fixture'
  | 'llm_draft_unconfirmed';

export interface DisplayValue {
  value: number;
  unit: string;
  canonical_value: number;
  canonical_unit: string;
}

export interface Assumption {
  key: string;
  statement: string;
  source_status: SourceStatus;
  source_reference?: string | null;
  requires_confirmation: boolean;
  confirmed: boolean;
}

export interface MissingField {
  field: string;
  label: string;
  expected_kind: string;
  why_required: string;
  suggested_unit?: string | null;
}

/* ------------------------------------------------------------- profiles */

export interface ParameterSpec {
  name: string;
  label: string;
  kind: 'continuous' | 'integer';
  unit: string;
  minimum: number;
  maximum: number;
  default: number;
  step?: number | null;
  description?: string | null;
  is_design_variable: boolean;
  preserved_reason?: string | null;
}

export interface EngineeringInput {
  key: string;
  label: string;
  kind: string;
  unit: string;
  required: boolean;
  demo_default?: number | null;
  demo_default_display?: number | null;
  help_text: string;
  why_required: string;
}

export interface Material {
  material_id: string;
  name: string;
  family: string;
  typical_use?: string | null;
  density: number;
  elastic_modulus?: number | null;
  poisson_ratio?: number | null;
  yield_strength?: number | null;
  thermal_conductivity?: number | null;
  specific_heat?: number | null;
  max_service_temperature?: number | null;
  source_status: string;
  notes?: string | null;
  supports_structural: boolean;
  supports_thermal: boolean;
  supports_yield_margin: boolean;
}

export interface MeshPresetInfo {
  key: string;
  label: string;
  description: string;
  element_size_scale: number;
  target_element_size_mm: number;
}

export interface ObjectiveSpec {
  objective_id: string;
  metric: string;
  sense: 'minimize' | 'maximize';
  weight?: number;
  label?: string | null;
}

export interface Profile {
  component_type: ComponentType;
  display_name: string;
  summary: string;
  analysis_type: AnalysisType;
  solver_id: string;
  solver_name: string;
  result_kind: string;
  method_statement: string;
  scope_statement: string;
  not_in_scope: string[];
  capability_note: string;
  parameters: ParameterSpec[];
  design_variables: string[];
  engineering_inputs: EngineeringInput[];
  materials: Material[];
  material_assignments: Record<string, string>;
  /** Objectives this profile can optimise, in its own default order. */
  objectives: ObjectiveSpec[];
  region_names: string[];
  demo_assumptions: Assumption[];
  mesh_presets: MeshPresetInfo[];
}

/* ------------------------------------------------- projects & components */

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  component_count: number;
  design_count: number;
  job_count: number;
}

export interface ComponentInstance {
  id: string;
  project_id: string;
  component_type: ComponentType;
  design_mode: DesignMode;
  name: string;
  unit_system: string;
  source_asset_path?: string | null;
  source_metadata?: Record<string, unknown> | null;
  source_is_parametric: boolean;
  created_at: string;
}

/* -------------------------------------------------------------- studies */

export interface StudyRequest {
  component_instance_id: string;
  material_id: string;
  objective_summary: string;
  engineering_inputs: Record<string, number>;
  parameters: Record<string, number>;
  design_variables: string[];
  /** Objective ids to optimise, most important first. */
  objectives: string[];
  strategy: 'doe' | 'nsga2';
  candidate_budget: number;
  population_size: number;
  generations: number;
  mesh_preset: 'screening' | 'exploration' | 'verification';
  verify_winner: boolean;
  random_seed: number;
  time_budget_seconds?: number | null;
  confirm_demo_assumptions: boolean;
}

export interface ValidationResponse {
  ok: boolean;
  message: string;
  missing_fields: MissingField[];
  errors: string[];
  unconfirmed_assumptions: Assumption[];
}

export interface JobAccepted {
  job_id: string;
  status: string;
  deduplicated: boolean;
  poll_url: string;
}

export interface Job {
  id: string;
  job_type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  stage: string;
  progress: number;
  message?: string | null;
  error?: string | null;
  project_id?: string | null;
  component_instance_id?: string | null;
  optimization_run_id?: string | null;
  stage_history: Array<{ stage: string; at: string }>;
  result_payload?: Record<string, unknown> | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  log_available: boolean;
}

export interface ConstraintResult {
  constraint_id: string;
  metric: string;
  label?: string | null;
  operator: string;
  description: string;
  source_status: SourceStatus;
  source_reference?: string | null;
  value?: DisplayValue | null;
  limit?: DisplayValue | null;
  lower?: DisplayValue | null;
  upper?: DisplayValue | null;
  /** null means the metric was not produced, so there is no verdict. */
  passed?: boolean | null;
  margin_fraction?: number | null;
  note?: string | null;
}

export interface ObjectiveValue {
  objective_id: string;
  metric: string;
  sense: 'minimize' | 'maximize';
  label?: string | null;
  value?: DisplayValue | null;
  normalized_cost?: number | null;
}

export interface Candidate {
  candidate_id: string;
  index: number;
  generation: number;
  status: CandidateStatus;
  is_baseline: boolean;
  from_cache: boolean;
  parameters: Record<string, number>;
  geometry_hash: string;
  metrics: Record<string, number>;
  display_metrics: Record<string, DisplayValue>;
  constraint_results: ConstraintResult[];
  objective_values: ObjectiveValue[];
  is_feasible?: boolean | null;
  infeasibility_reasons: string[];
  failure_stage?: string | null;
  failure_reason?: string | null;
  rank?: number | null;
  pareto_front?: number | null;
  evaluated: boolean;
  design_version_id?: string | null;
  preview_url?: string | null;
  step_url?: string | null;
  fields_url?: string | null;
  solve_time_seconds?: number | null;
  mesh_node_count?: number | null;
  warnings: string[];
}

export interface Recommendation {
  candidate_id?: string | null;
  improves_on_baseline?: boolean | null;
  primary_metric?: string | null;
  baseline_value?: number | null;
  candidate_value?: number | null;
  percent_change?: number | null;
  statement: string;
}

export interface ComparisonEntry {
  available: boolean;
  baseline?: DisplayValue;
  candidate?: DisplayValue;
  absolute_change?: number;
  percent_change?: number | null;
}

export interface MeshConvergence {
  performed: boolean;
  coarse_preset: string;
  fine_preset: string;
  coarse_nodes?: number | null;
  fine_nodes?: number | null;
  metrics: Record<
    string,
    {
      available: boolean;
      coarse?: number;
      fine?: number;
      relative_change?: number;
      percent_change?: number;
      converged?: boolean;
    }
  >;
  converged?: boolean | null;
  tolerance: number;
  statement: string;
  coarse_feasible?: boolean | null;
  fine_feasible?: boolean | null;
  verdict_changed?: boolean | null;
  unconverged_metrics: string[];
}

export interface StudySummary {
  candidates_generated: number;
  candidates_evaluated: number;
  candidates_feasible: number;
  candidates_failed: number;
  cache_hits: number;
  total_seconds?: number | null;
  mean_solve_seconds?: number | null;
  max_solve_seconds?: number | null;
}

export interface StudyResult {
  optimization_run_id: string;
  component_instance_id: string;
  component_type: ComponentType;
  analysis_type: AnalysisType;
  algorithm: string;
  random_seed: number;
  status: string;
  solver_name: string;
  solver_version: string;
  method_statement: string;
  mesh_preset: string;
  summary: StudySummary;
  termination_reason: string;
  candidates: Candidate[];
  baseline_candidate_id?: string | null;
  recommended_candidate_id?: string | null;
  recommendation?: Recommendation | null;
  comparison: Record<string, ComparisonEntry>;
  mesh_convergence: MeshConvergence;
  objectives: Array<Record<string, unknown>>;
  constraints: Array<Record<string, unknown>>;
  assumptions: Assumption[];
  specification: Record<string, unknown>;
  warnings: string[];
}

/* -------------------------------------------------------- visualization */

export interface VisualizationPayload {
  candidate_id: string;
  result_kind: string;
  analysis_type: string;
  geometry_asset_url?: string | null;
  node_count: number;
  triangle_count: number;
  nodes: number[][];
  faces: number[][];
  displacement?: number[][] | null;
  von_mises?: number[] | null;
  temperature?: number[] | null;
  stress_location?: string | null;
  temperature_location?: string | null;
  stress_range_pa?: [number, number] | null;
  temperature_range_k?: [number, number] | null;
  displacement_range_m?: [number, number] | null;
  recommended_deformation_scale: number;
  max_displacement_m?: number | null;
  visualization_note: string;
  method_statement: string;
}

/* ------------------------------------------------------------ assistant */

export interface ExtractedValue {
  key: string;
  value_canonical: number;
  canonical_unit: string;
  display_value: number;
  display_unit: string;
  source_text: string;
  confidence: 'explicit' | 'inferred';
}

export interface RequirementDraft {
  interpreted: boolean;
  parser: string;
  component_type?: ComponentType | null;
  design_mode: DesignMode;
  analysis_type?: AnalysisType | null;
  objective_summary: string;
  material_id?: string | null;
  material_candidates: string[];
  engineering_inputs: Record<string, number>;
  extracted_values: ExtractedValue[];
  objectives: string[];
  design_variables: string[];
  missing_fields: MissingField[];
  assumptions_requiring_confirmation: Assumption[];
  warnings: string[];
  notes: string[];
}

export interface GroundedFact {
  label: string;
  metric: string;
  value: number;
  unit: string;
  canonical_value: number;
  canonical_unit: string;
  source: string;
}

export interface Explanation {
  generator: string;
  headline: string;
  paragraphs: string[];
  grounded_facts: GroundedFact[];
  constraint_statements: string[];
  caveats: string[];
  method_statement: string;
}

/* ----------------------------------------------------------------- cost */

export interface CostInputs {
  currency: string;
  prototype_unit_cost: number;
  physical_test_cost: number;
  engineering_hourly_cost: number;
  traditional_physical_iterations: number;
  traditional_engineering_hours_per_iteration: number;
  physical_iterations_after_virtual: number;
  virtual_engineering_hours: number;
  virtual_compute_cost: number;
  lead_time_days_per_physical_iteration?: number | null;
  lead_time_days_per_virtual_study?: number | null;
}

export interface CostLine {
  label: string;
  amount: number;
  formula: string;
}

export interface CostEstimate {
  currency: string;
  inputs: CostInputs;
  traditional_cost: number;
  virtual_first_cost: number;
  estimated_savings: number;
  estimated_savings_percent?: number | null;
  traditional_breakdown: CostLine[];
  virtual_breakdown: CostLine[];
  physical_iterations_avoided: number;
  traditional_lead_time_days?: number | null;
  virtual_first_lead_time_days?: number | null;
  lead_time_days_saved?: number | null;
  disclaimer: string;
  assumptions: string[];
}

/* --------------------------------------------------------- capabilities */

export interface BenchmarkQuantity {
  computed: number;
  reference: number;
  unit: string;
  relative_error: number;
  tolerance: number;
  reference_basis: string;
  passed: boolean;
}

export interface Benchmark {
  name: string;
  description: string;
  reference_source: string;
  passed: boolean;
  quantities: Record<string, BenchmarkQuantity>;
  notes: string[];
}

export interface Capabilities {
  solvers: {
    in_process_solvers: Array<{
      solver_id: string;
      name: string;
      version: string;
      analysis_type: string;
      result_kind: string;
      method_statement: string;
      verified_by_benchmark: boolean;
    }>;
    external_solvers: Record<
      string,
      { configured: boolean; available: boolean; note: string }
    >;
  };
  cad_kernel: string;
  mesher: string;
  optimizers: string[];
  limits: Record<string, number>;
  standing_limitations: string[];
  benchmarks?: Benchmark[];
  benchmarks_all_passed?: boolean;
}

/* ------------------------------------------------- reduced-order estimate */

export interface EstimatedMetric {
  key: string;
  label: string;
  value: number;
  display_value: number;
  display_unit: string;
  model: string;
  confidence: 'indicative' | 'trend_only';
}

export interface EstimateResult {
  component_type: ComponentType;
  fidelity: string;
  metrics: EstimatedMetric[];
  assumptions: string[];
  calibration_note: string;
  is_estimate: boolean;
  disclaimer: string;
}

export interface EstimateRequest {
  component_type: ComponentType;
  parameters: Record<string, number>;
  engineering_inputs: Record<string, number>;
  material_id?: string | null;
  material_assignments: Record<string, string>;
}
