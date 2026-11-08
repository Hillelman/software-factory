export type Step = 'builder' | 'cleaner' | 'checker' | 'tester' | 'approver';
export type Status = 'backlog' | 'in_progress' | 'paused' | 'approved' | 'merged' | 'error' | 'cancelled';
export type ColumnId = 'backlog' | 'in_progress' | 'error' | 'approved' | 'merged';

export interface TaskTokens {
  total: number;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheCreation?: number;
  estimated: boolean;
}

export interface TaskSummary {
  id: string;
  title: string;
  sessionId: string;
  status: Status;
  step: Step | null;
  lastPassed: Step | null;
  run: number;
  maxRuns: number;
  control: 'pause' | null;
  prUrl: string | null;
  lastError: { step: Step; run: number; message: string } | null;
  dependsOn: string[];
  restarts: number;
  createdAt: string;
  startedAt: string | null;
  stepStartedAt: string | null;
  finishedAt: string | null;
  stuckLevel: number;
  tokens: TaskTokens;
}

export interface SessionSummary {
  id: string;
  branch: string;
  startedAt: string;
  endedAt: string | null;
  taskCount: number;
}

export interface FactoryState {
  project: { name: string; branch: string | null };
  currentSession: string | null;
  sessions: SessionSummary[];
  steps: Step[];
  stuckMinutes: number;
  access: { localUrl: string | null; lanUrls: string[] };
  serverTime: string;
  tasks: TaskSummary[];
}

export interface FactoryEvent {
  ts: string;
  type: string;
  step?: Step;
  run?: number;
  isApproved?: boolean;
  errorMessage?: string;
  message?: string;
  prUrl?: string;
  prompt?: string;
  minutes?: number;
  signal?: string;
}

export interface TaskDetail {
  task: TaskSummary;
  taskMd: string;
  events: FactoryEvent[];
  runs: Record<string, Partial<Record<Step, string>>>;
}
