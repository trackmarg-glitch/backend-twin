/** Typed API client.
 *
 * A 422 from the backend is a *validation* response, not a crash: it lists the
 * engineering inputs that are missing or the assumptions still to accept. The
 * client surfaces that as structured data so the UI can show exactly what the
 * engineer needs to supply. */

import axios, { AxiosError } from 'axios';
import type {
  Candidate,
  Capabilities,
  EstimateRequest,
  EstimateResult,
  ComponentInstance,
  ComponentType,
  CostEstimate,
  CostInputs,
  Explanation,
  Job,
  JobAccepted,
  Profile,
  Project,
  RequirementDraft,
  StudyRequest,
  StudyResult,
  ValidationResponse,
  VisualizationPayload,
} from '../types/api';

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000';

const client = axios.create({ baseURL: `${API_BASE}/api`, timeout: 120_000 });

/** A validation failure the engineer can act on. */
export class ApiValidationError extends Error {
  readonly response: ValidationResponse;
  constructor(response: ValidationResponse) {
    super(response.message);
    this.name = 'ApiValidationError';
    this.response = response;
  }
}

function looksLikeValidation(data: unknown): data is ValidationResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    ('missing_fields' in data || 'unconfirmed_assumptions' in data || 'errors' in data)
  );
}

function rethrow(error: unknown): never {
  const axiosError = error as AxiosError;
  const data = axiosError.response?.data;

  if (axiosError.response?.status === 422 && looksLikeValidation(data)) {
    throw new ApiValidationError({
      ok: false,
      message: data.message,
      missing_fields: data.missing_fields ?? [],
      errors: data.errors ?? [],
      unconfirmed_assumptions: data.unconfirmed_assumptions ?? [],
    });
  }

  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  if (axiosError.code === 'ERR_NETWORK') {
    throw new Error(
      `Cannot reach the AutoTwin backend at ${API_BASE}. Start it with: ` +
        'uvicorn app.main:app --port 8000',
    );
  }
  throw error instanceof Error ? error : new Error(String(error));
}

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  try {
    return (await client.get<T>(url, { params })).data;
  } catch (error) {
    rethrow(error);
  }
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  try {
    return (await client.post<T>(url, body)).data;
  } catch (error) {
    rethrow(error);
  }
}

export const api = {
  health: () => get<Record<string, unknown>>('/health'),
  capabilities: (runBenchmarks = true) =>
    get<Capabilities>('/capabilities', { run_benchmarks: runBenchmarks }),

  profiles: () => get<Profile[]>('/components/profiles'),
  profile: (componentType: ComponentType) =>
    get<Profile>(`/components/profiles/${componentType}`),

  listProjects: () => get<Project[]>('/projects'),
  createProject: (name: string, description?: string) =>
    post<Project>('/projects', { name, description }),

  listComponents: (projectId: string) =>
    get<ComponentInstance[]>(`/projects/${projectId}/components`),
  createComponent: (body: {
    project_id: string;
    component_type: ComponentType;
    design_mode: string;
    name: string;
  }) => post<ComponentInstance>('/components', body),

  validateStudy: (request: StudyRequest) =>
    post<Record<string, unknown>>('/studies/validate', request),
  startStudy: (request: StudyRequest) => post<JobAccepted>('/studies', request),
  listStudies: (componentInstanceId?: string) =>
    get<Array<Record<string, unknown>>>('/studies', {
      component_instance_id: componentInstanceId,
    }),
  study: (runId: string) => get<StudyResult>(`/studies/${runId}`),

  job: (jobId: string) => get<Job>(`/jobs/${jobId}`),
  jobLog: (jobId: string) => get<string>(`/jobs/${jobId}/log`),
  cancelJob: (jobId: string) => post<Record<string, unknown>>(`/jobs/${jobId}/cancel`),

  candidate: (candidateId: string) => get<Candidate>(`/candidates/${candidateId}`),
  candidateDiagnostics: (candidateId: string) =>
    get<Record<string, unknown>>(`/candidates/${candidateId}/diagnostics`),
  visualization: (candidateId: string, deformationScale?: number) =>
    get<VisualizationPayload>(`/candidates/${candidateId}/visualization`, {
      deformation_scale: deformationScale,
    }),

  /** Reduced-order estimate for live slider feedback. Never a solver result. */
  estimatePreview: (request: EstimateRequest) =>
    post<EstimateResult>('/estimate/preview', request),

  interpret: (text: string, componentType?: ComponentType) =>
    post<RequirementDraft>('/assistant/interpret', {
      text,
      component_type: componentType ?? null,
      use_llm: true,
    }),
  assistantStatus: () => get<Record<string, unknown>>('/assistant/status'),
  explainCandidate: (candidateId: string) =>
    get<Explanation>(`/assistant/explain/candidate/${candidateId}`),
  explainStudy: (runId: string) => get<Explanation>(`/assistant/explain/study/${runId}`),

  estimateCost: (inputs: CostInputs) => post<CostEstimate>('/cost/estimate', inputs),
  costTemplate: () => get<Record<string, unknown>>('/cost/template'),

  generateReport: (runId: string) =>
    post<Record<string, unknown>>('/reports/generate', { optimization_run_id: runId }),
  reportMarkdown: (runId: string) => get<string>(`/reports/${runId}/markdown`),

  assetUrl: (path: string) => `${API_BASE}${path}`,
};

/** Poll a job until it finishes, reporting progress as it goes. */
export async function pollJob(
  jobId: string,
  onUpdate: (job: Job) => void,
  options: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<Job> {
  const interval = options.intervalMs ?? 1500;
  for (;;) {
    if (options.signal?.aborted) throw new Error('polling aborted');
    const job = await api.job(jobId);
    onUpdate(job);
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
