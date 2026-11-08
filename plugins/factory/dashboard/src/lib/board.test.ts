import { describe, expect, it } from 'vitest';
import { columnOf, diffAlerts, focusSession, groupByColumn, stepStates, timeline, visibleTasks } from './board';
import { formatDuration, formatTokens } from './format';
import { state, task } from '@/test/fixtures';

describe('columns', () => {
  it('maps every status to one of the five board columns', () => {
    expect(columnOf('backlog')).toBe('backlog');
    expect(columnOf('in_progress')).toBe('in_progress');
    expect(columnOf('paused')).toBe('in_progress');
    expect(columnOf('error')).toBe('error');
    expect(columnOf('cancelled')).toBe('error');
    expect(columnOf('approved')).toBe('approved');
    expect(columnOf('merged')).toBe('merged');
  });

  it('groups tasks and keeps every column present even when empty', () => {
    const groups = groupByColumn([task({ id: 'T-0002', status: 'merged' }), task({ id: 'T-0003', status: 'merged' }), task()]);
    expect(groups.merged.map((t) => t.id)).toEqual(['T-0003', 'T-0002']);
    expect(groups.in_progress).toHaveLength(1);
    expect(groups.backlog).toEqual([]);
  });
});

describe('previous sessions filter', () => {
  const tasks = [task({ id: 'T-0001', sessionId: 'S-20261107-1' }), task({ id: 'T-0002' })];

  it('shows only the current session by default', () => {
    expect(visibleTasks(state(tasks), false).map((t) => t.id)).toEqual(['T-0002']);
  });

  it('shows every session when toggled on', () => {
    expect(visibleTasks(state(tasks), true)).toHaveLength(2);
  });

  it('falls back to the latest session when none is active', () => {
    const s = state(tasks, { currentSession: null });
    expect(focusSession(s)).toBe('S-20261108-1');
    expect(visibleTasks(s, false).map((t) => t.id)).toEqual(['T-0002']);
  });

  it('shows everything when there are no sessions at all', () => {
    expect(visibleTasks(state(tasks, { currentSession: null, sessions: [] }), false)).toHaveLength(2);
  });
});

describe('step progress', () => {
  it('marks passed, running and pending steps', () => {
    expect(stepStates(task())).toEqual({ builder: 'passed', cleaner: 'running', checker: 'pending', tester: 'pending', approver: 'pending' });
  });

  it('marks the failing step of the final run', () => {
    const s = stepStates(task({ status: 'error', step: null, lastPassed: 'cleaner', run: 2, lastError: { step: 'checker', run: 2, message: 'XSS' } }));
    expect(s.checker).toBe('failed');
  });

  it('marks everything passed once merged', () => {
    expect(Object.values(stepStates(task({ status: 'merged', step: null, lastPassed: 'approver' })))).toEqual(Array(5).fill('passed'));
  });

  it('rebuilds runs from events and resets on restart', () => {
    const runs = timeline([
      { ts: '1', type: 'step_started', step: 'builder', run: 1 },
      { ts: '2', type: 'step_finished', step: 'builder', run: 1, isApproved: false, errorMessage: 'boom' },
      { ts: '3', type: 'step_started', step: 'builder', run: 2 },
    ]);
    expect(runs.map((r) => r.run)).toEqual([1, 2]);
    expect(runs[0]?.steps[0]).toMatchObject({ state: 'failed', errorMessage: 'boom' });
    expect(runs[1]?.steps[0]?.state).toBe('running');
    expect(timeline([{ ts: '1', type: 'step_started', step: 'builder', run: 1 }, { ts: '2', type: 'restarted' }])).toEqual([]);
  });
});

describe('alerts', () => {
  it('ignores the first snapshot', () => {
    expect(diffAlerts(null, [task({ status: 'error' })], 7)).toEqual([]);
  });

  it('alerts on errors, approvals, merges and stuck steps', () => {
    const prev = [task({ id: 'T-1' }), task({ id: 'T-2' }), task({ id: 'T-3', status: 'approved' }), task({ id: 'T-4' })];
    const next = [
      task({ id: 'T-1', status: 'error', lastError: { step: 'tester', run: 2, message: 'tests failed' } }),
      task({ id: 'T-2', status: 'approved' }),
      task({ id: 'T-3', status: 'merged' }),
      task({ id: 'T-4', stuckLevel: 1 }),
    ];
    expect(diffAlerts(prev, next, 7).map((a) => [a.id, a.kind])).toEqual([
      ['T-1', 'error'],
      ['T-2', 'approved'],
      ['T-3', 'merged'],
      ['T-4', 'stuck'],
    ]);
  });

  it('does not repeat an alert when nothing changed', () => {
    const t = [task({ stuckLevel: 1 })];
    expect(diffAlerts(t, t, 7)).toEqual([]);
  });
});

describe('formatting', () => {
  it('formats durations and token counts compactly', () => {
    expect(formatDuration(42_000)).toBe('42s');
    expect(formatDuration(125_000)).toBe('2m 05s');
    expect(formatDuration(3_720_000)).toBe('1h 02m');
    expect(formatDuration(-5)).toBe('0s');
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(12_400)).toBe('12k');
    expect(formatTokens(4_200)).toBe('4.2k');
    expect(formatTokens(2_300_000)).toBe('2.3M');
  });
});
