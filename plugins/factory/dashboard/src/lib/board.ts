import type { ColumnId, FactoryEvent, FactoryState, Status, Step, TaskSummary } from './types';

export const STEPS: Step[] = ['builder', 'cleaner', 'checker', 'tester', 'approver'];

export const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'error', label: 'Errors' },
  { id: 'approved', label: 'Approved' },
  { id: 'merged', label: 'Merged' },
];

const COLUMN_OF: Record<Status, ColumnId> = {
  backlog: 'backlog',
  in_progress: 'in_progress',
  paused: 'in_progress',
  error: 'error',
  cancelled: 'error',
  approved: 'approved',
  merged: 'merged',
};

export const columnOf = (status: Status): ColumnId => COLUMN_OF[status];

// The session to show when previous sessions are hidden: the active one, else the latest.
export function focusSession(state: Pick<FactoryState, 'currentSession' | 'sessions'>): string | null {
  if (state.currentSession) return state.currentSession;
  const latest = [...state.sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1);
  return latest?.id ?? null;
}

export function visibleTasks(state: FactoryState, showPrevious: boolean): TaskSummary[] {
  if (showPrevious) return state.tasks;
  const session = focusSession(state);
  return session ? state.tasks.filter((t) => t.sessionId === session) : state.tasks;
}

export function groupByColumn(tasks: TaskSummary[]): Record<ColumnId, TaskSummary[]> {
  const groups: Record<ColumnId, TaskSummary[]> = { backlog: [], in_progress: [], error: [], approved: [], merged: [] };
  for (const task of tasks) groups[columnOf(task.status)].push(task);
  // Newest ids first in finished columns, oldest first where work is still flowing.
  for (const id of ['merged', 'error'] as const) groups[id].sort((a, b) => b.id.localeCompare(a.id));
  for (const id of ['backlog', 'in_progress', 'approved'] as const) groups[id].sort((a, b) => a.id.localeCompare(b.id));
  return groups;
}

export type StepState = 'pending' | 'running' | 'passed' | 'failed';

export function stepStates(task: TaskSummary): Record<Step, StepState> {
  const passedIdx = task.lastPassed ? STEPS.indexOf(task.lastPassed) : -1;
  const result = {} as Record<Step, StepState>;
  STEPS.forEach((step, i) => {
    if (task.status === 'merged' || i <= passedIdx) result[step] = 'passed';
    else if (task.step === step) result[step] = 'running';
    else if (task.status === 'error' && task.lastError?.step === step && task.lastError.run === task.run) result[step] = 'failed';
    else result[step] = 'pending';
  });
  return result;
}

export interface TimelineStep {
  step: Step;
  state: StepState;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}
export interface TimelineRun {
  run: number;
  steps: TimelineStep[];
}

// Rebuilds each run's step history from the append-only event log.
export function timeline(events: FactoryEvent[]): TimelineRun[] {
  const runs = new Map<number, Map<Step, TimelineStep>>();
  const ensure = (run: number) => {
    let steps = runs.get(run);
    if (!steps) {
      steps = new Map(STEPS.map((step) => [step, { step, state: 'pending', startedAt: null, finishedAt: null, errorMessage: null }]));
      runs.set(run, steps);
    }
    return steps;
  };
  for (const e of events) {
    if (e.type === 'restarted') runs.clear();
    if (!e.step || e.run === undefined) continue;
    const entry = ensure(e.run).get(e.step);
    if (!entry) continue;
    if (e.type === 'step_started') {
      Object.assign(entry, { state: 'running', startedAt: e.ts, finishedAt: null, errorMessage: null });
    } else if (e.type === 'step_finished') {
      Object.assign(entry, { state: e.isApproved ? 'passed' : 'failed', finishedAt: e.ts, errorMessage: e.isApproved ? null : (e.errorMessage ?? null) });
    }
  }
  return [...runs.entries()].sort(([a], [b]) => a - b).map(([run, steps]) => ({ run, steps: [...steps.values()] }));
}

export type Alert = { id: string; title: string; kind: 'error' | 'approved' | 'merged' | 'stuck'; message: string };

// Compares two snapshots and returns what the user should be notified about.
export function diffAlerts(prev: TaskSummary[] | null, next: TaskSummary[], stuckMinutes: number): Alert[] {
  if (!prev) return [];
  const before = new Map(prev.map((t) => [t.id, t]));
  const alerts: Alert[] = [];
  for (const t of next) {
    const old = before.get(t.id);
    if (!old) continue;
    if (old.status !== t.status) {
      if (t.status === 'error') alerts.push({ id: t.id, title: t.title, kind: 'error', message: t.lastError?.message ?? 'Task failed.' });
      if (t.status === 'approved') alerts.push({ id: t.id, title: t.title, kind: 'approved', message: 'Approved, merging the PR.' });
      if (t.status === 'merged') alerts.push({ id: t.id, title: t.title, kind: 'merged', message: 'Merged into the orchestrator branch.' });
    }
    if (t.stuckLevel > old.stuckLevel && t.step) {
      alerts.push({ id: t.id, title: t.title, kind: 'stuck', message: `${t.step} running for over ${stuckMinutes * t.stuckLevel} min.` });
    }
  }
  return alerts;
}
