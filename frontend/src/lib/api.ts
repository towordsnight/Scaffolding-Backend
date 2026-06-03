export const apiClient = {
  baseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || '',
  credentials: 'include' as const,
  buildUrl(path: string) {
    return this.baseUrl ? new URL(path, this.baseUrl).toString() : path;
  },
  async fetch(path: string, init?: RequestInit) {
    return fetch(this.buildUrl(path), {
      credentials: this.credentials,
      ...init,
    });
  },
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiClient.fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body)
      ? String((body as { error: unknown }).error)
      : `Request failed (${res.status})`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export type CourseLevel = 'intro' | 'intermediate' | 'advanced';
export type LearnerProfile = 'starter' | 'exploring' | 'distracted' | 'independent';
export type Topic = 'kvl' | 'kcl' | 'phasors' | 'impedance' | 'thevenin';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type StepType = 'mcq' | 'numeric' | 'planning' | 'open';

export interface PublicProblem {
  id: string;
  topic: Topic;
  difficulty: Difficulty;
  problem_text: string;
  error_taxonomy: string[];
  created_at: string;
}

export interface HomeworkProblem {
  id: string;
  topic: Topic;
  difficulty: Difficulty;
  problem_text: string;
  attempted: boolean;
}

export interface HomeworkSet {
  id: string;
  name: string;
  course_level: CourseLevel;
  topic: Topic | null;
  problems: HomeworkProblem[];
}

export interface ScaffoldStepOption {
  key: string;
  text: string;
}

export interface ScaffoldStep {
  id: string;
  step_order: number;
  step_type: StepType;
  prompt_text: string;
  options: ScaffoldStepOption[] | null;
}

export interface ProblemScaffold {
  problem_id: string;
  variant_id: string | null;
  learner_profile: LearnerProfile;
  total_steps: number;
  current_step_id: string | null;
  steps: ScaffoldStep[];
}

export interface StepSubmitResult {
  correct: boolean | null;
  ungraded: boolean;
  next_step_id: string | null;
  misconception_hint: string | null;
}

export const auth = {
  register: (input: {
    email: string;
    password: string;
    display_name?: string;
    course_level?: CourseLevel;
    consent?: boolean;
  }) => request<{ id: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  }),

  login: (input: { email: string; password: string }) =>
    request<{ id: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: () => request<{ message: string }>('/api/auth/logout', { method: 'POST' }),
};

export const onboarding = {
  acceptConsent: (consent: boolean) =>
    request<{ consented: boolean }>('/api/onboarding/consent', {
      method: 'POST',
      body: JSON.stringify({ consent }),
    }),

  declaration: (input: {
    adhd_flag: boolean;
    stress_baseline: 0 | 1 | 2;
    course_level: CourseLevel;
    learner_profile?: LearnerProfile;
  }) => request<{ declared: true }>('/api/onboarding/declaration', {
    method: 'POST',
    body: JSON.stringify(input),
  }),

  getDiagnosticProblems: () =>
    request<{ problems: PublicProblem[] }>('/api/onboarding/problems'),

  submitDiagnostic: (
    answers: Array<{ problem_id: string; submitted_answer: number; time_spent_s: number }>,
  ) => request<{
    completed: true;
    session_id: string;
    results: Array<{ problem_id: string; topic: Topic; correct: boolean }>;
  }>('/api/onboarding/diagnostic', {
    method: 'POST',
    body: JSON.stringify({ answers }),
  }),
};

export const problems = {
  get: (id: string) => request<PublicProblem>(`/api/problems/${id}`),
  next: () => request<PublicProblem>('/api/problems/next'),
  submit: (id: string, input: { session_id: string; submitted_answer: number; time_spent_s: number }) =>
    request<{
      correct: boolean;
      topic: Topic;
      intervention: unknown | null;
    }>(`/api/problems/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getScaffold: (id: string, sessionId?: string) => {
    const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return request<ProblemScaffold>(`/api/problems/${id}/scaffold${query}`);
  },

  submitStep: (
    id: string,
    stepId: string,
    input: { session_id: string; submitted_value: string | number; time_spent_s: number },
  ) => request<StepSubmitResult>(`/api/problems/${id}/steps/${stepId}/submit`, {
    method: 'POST',
    body: JSON.stringify(input),
  }),
};

export const homeworkSets = {
  list: () => request<HomeworkSet[]>('/api/homework-sets'),
};

export const sessions = {
  create: (input?: { problem_id?: string }) =>
    request<{ session_id: string }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    }),

  heartbeat: (id: string) =>
    request<{ intervention: unknown | null }>(`/api/sessions/${id}/heartbeat`, {
      method: 'POST',
    }),

  end: (id: string) =>
    request<{ ended: true }>(`/api/sessions/${id}/end`, { method: 'POST' }),

  getState: (id: string) =>
    request<{ session: unknown; state: unknown }>(`/api/sessions/${id}`),
};
