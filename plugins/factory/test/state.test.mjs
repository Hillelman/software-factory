import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sm from '../lib/state.mjs';

const T0 = '2026-11-08T10:00:00.000Z';
const fresh = () => sm.newTaskState({ id: 'T-0001', title: 'Add filter', sessionId: 'S-1', baseBranch: 'factory/feat', now: T0 });

function runSteps(state, steps) {
  let s = state;
  for (const step of steps) {
    s = sm.beginStep(s, step, T0).state;
    s = sm.endStep(s, step, { isApproved: true, errorMessage: '' }, T0).state;
  }
  return s;
}

test('happy path goes backlog → in_progress → approved → merged', () => {
  let s = sm.start(fresh(), T0);
  s = runSteps(s, ['builder', 'cleaner', 'checker', 'tester']);
  s = sm.beginStep(s, 'approver', T0).state;
  s = sm.approve(s, 'https://github.com/o/r/pull/1');
  assert.equal(s.status, 'approved');
  const r = sm.endStep(s, 'approver', { isApproved: true, errorMessage: '' }, T0);
  assert.equal(r.signal, 'merged');
  assert.equal(r.state.status, 'merged');
});

test('steps must run in order', () => {
  const s = sm.start(fresh(), T0);
  assert.throws(() => sm.beginStep(s, 'tester', T0), /next step in run 1 is builder/);
  assert.throws(() => sm.beginStep(s, 'deployer', T0), /Unknown step/);
});

test('a failure restarts from the builder, and a second failure ends in error', () => {
  let s = sm.start(fresh(), T0);
  s = runSteps(s, ['builder']);
  s = sm.beginStep(s, 'cleaner', T0).state;
  let r = sm.endStep(s, 'cleaner', { isApproved: false, errorMessage: 'lint failed' }, T0);
  assert.equal(r.signal, 'retry');
  assert.equal(r.state.run, 2);
  assert.equal(r.state.lastPassed, null);
  assert.deepEqual(r.state.lastError, { step: 'cleaner', run: 1, message: 'lint failed' });
  assert.throws(() => sm.beginStep(r.state, 'checker', T0), /is builder/);
  s = sm.beginStep(r.state, 'builder', T0).state;
  r = sm.endStep(s, 'builder', { isApproved: false, errorMessage: 'still broken' }, T0);
  assert.equal(r.signal, 'error');
  assert.equal(r.state.status, 'error');
});

test('a merge conflict after approval sends the task back to the builder', () => {
  let s = sm.start(fresh(), T0);
  s = runSteps(s, ['builder', 'cleaner', 'checker', 'tester']);
  s = sm.approve(sm.beginStep(s, 'approver', T0).state, 'https://x/pull/1');
  const r = sm.endStep(s, 'approver', { isApproved: false, errorMessage: 'conflict in src/a.ts' }, T0);
  assert.equal(r.signal, 'retry');
  assert.equal(r.state.status, 'in_progress');
});

test('approver cannot report success without recording the PR', () => {
  let s = sm.start(fresh(), T0);
  s = runSteps(s, ['builder', 'cleaner', 'checker', 'tester']);
  s = sm.beginStep(s, 'approver', T0).state;
  assert.throws(() => sm.endStep(s, 'approver', { isApproved: true, errorMessage: '' }, T0), /factory approve/);
});

test('an empty error message still gets a useful message', () => {
  const s = sm.beginStep(sm.start(fresh(), T0), 'builder', T0).state;
  const r = sm.endStep(s, 'builder', { isApproved: false, errorMessage: '  ' }, T0);
  assert.match(r.state.lastError.message, /builder rejected/);
});

test('pause takes effect at the next step boundary and resume continues there', () => {
  let s = runSteps(sm.start(fresh(), T0), ['builder']);
  s = sm.pause(s);
  assert.equal(s.status, 'in_progress');
  const r = sm.beginStep(s, 'cleaner', T0);
  assert.equal(r.signal, 'pause');
  assert.equal(r.state.status, 'paused');
  const resumed = sm.resume(r.state);
  assert.equal(resumed.step, 'cleaner');
  assert.equal(resumed.state.status, 'in_progress');
});

test('resume withdraws a pause request that has not applied yet', () => {
  const s = sm.pause(sm.start(fresh(), T0));
  const r = sm.resume(s);
  assert.equal(r.state.control, null);
  assert.equal(r.step, null);
});

test('recover picks up a task whose runner died mid-step', () => {
  let s = runSteps(sm.start(fresh(), T0), ['builder', 'cleaner']);
  s = sm.beginStep(s, 'checker', T0).state;
  assert.throws(() => sm.resume(s), /only paused tasks/);
  const r = sm.resume(s, { recover: true });
  assert.equal(r.step, 'checker');
});

test('cancel stops the runner at its next step', () => {
  const s = sm.cancel(runSteps(sm.start(fresh(), T0), ['builder']), T0);
  assert.equal(sm.beginStep(s, 'cleaner', T0).signal, 'cancel');
  assert.equal(sm.endStep(s, 'cleaner', { isApproved: true }, T0).signal, 'cancel');
  assert.throws(() => sm.cancel(s, T0), /already cancelled/);
});

test('every control action on a merged task is refused with a clear message', () => {
  const merged = { ...fresh(), status: 'merged' };
  const msg = /T-0001 is already merged into factory\/feat; create a new task instead/;
  assert.throws(() => sm.pause(merged), msg);
  assert.throws(() => sm.resume(merged), msg);
  assert.throws(() => sm.resume(merged, { recover: true }), msg);
  assert.throws(() => sm.restart(merged), msg);
  assert.throws(() => sm.cancel(merged, T0), msg);
  assert.throws(() => sm.start(merged, T0), msg);
});

test('other illegal control actions are refused', () => {
  assert.throws(() => sm.pause(fresh()), /only in-progress tasks/);
  assert.throws(() => sm.resume(fresh()), /only paused tasks/);
  assert.throws(() => sm.restart(fresh()), /has not started/);
  assert.throws(() => sm.restart(sm.start(fresh(), T0)), /pause or cancel it/);
  assert.throws(() => sm.pause(sm.pause(sm.start(fresh(), T0))), /already paused/);
});

test('restart resets the run budget from error, cancelled and paused', () => {
  for (const status of ['error', 'cancelled', 'paused']) {
    const s = sm.restart({ ...fresh(), status, run: 2, lastPassed: 'tester', alerts: { '2:tester': 1 } });
    assert.equal(s.status, 'backlog');
    assert.equal(s.run, 1);
    assert.equal(s.lastPassed, null);
    assert.deepEqual(s.alerts, {});
    assert.equal(s.restarts, 1);
  }
});
