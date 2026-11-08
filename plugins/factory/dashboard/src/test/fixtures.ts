import type { FactoryState, TaskSummary } from '@/lib/types';

export function task(over: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: 'T-0001',
    title: 'Add a filter to the todo list',
    sessionId: 'S-20261108-1',
    status: 'in_progress',
    step: 'cleaner',
    lastPassed: 'builder',
    run: 1,
    maxRuns: 2,
    control: null,
    prUrl: null,
    lastError: null,
    dependsOn: [],
    restarts: 0,
    createdAt: '2026-11-08T10:00:00.000Z',
    startedAt: '2026-11-08T10:00:00.000Z',
    stepStartedAt: '2026-11-08T10:03:00.000Z',
    finishedAt: null,
    stuckLevel: 0,
    tokens: { total: 12_400, estimated: true },
    ...over,
  };
}

export function state(tasks: TaskSummary[], over: Partial<FactoryState> = {}): FactoryState {
  return {
    project: { name: 'todo-app', branch: 'factory/filters' },
    currentSession: 'S-20261108-1',
    sessions: [
      { id: 'S-20261107-1', branch: 'factory/old', startedAt: '2026-11-07T09:00:00.000Z', endedAt: '2026-11-07T12:00:00.000Z', taskCount: 1 },
      { id: 'S-20261108-1', branch: 'factory/filters', startedAt: '2026-11-08T09:00:00.000Z', endedAt: null, taskCount: 2 },
    ],
    steps: ['builder', 'cleaner', 'checker', 'tester', 'approver'],
    stuckMinutes: 7,
    access: { localUrl: 'http://localhost:4317/?t=abc', lanUrls: ['http://192.168.1.20:4317/?t=abc'] },
    serverTime: '2026-11-08T10:05:00.000Z',
    tasks,
    ...over,
  };
}
