// Pure task state machine. Every function takes a state and returns a new one,
// or throws FactoryError with a message meant to be shown to the user as-is.

export const STEPS = ['builder', 'cleaner', 'checker', 'tester', 'approver'];
export const STATUSES = ['backlog', 'in_progress', 'paused', 'approved', 'merged', 'error', 'cancelled'];
export const DEFAULT_MAX_RUNS = 2;

export class FactoryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FactoryError';
  }
}

export function newTaskState({ id, title, sessionId, baseBranch, dependsOn = [], maxRuns = DEFAULT_MAX_RUNS, now }) {
  return {
    id,
    title,
    sessionId,
    status: 'backlog',
    step: null,
    lastPassed: null,
    run: 1,
    maxRuns,
    baseBranch,
    branch: `factory/${id}`,
    dependsOn,
    control: null,
    prUrl: null,
    lastError: null,
    restarts: 0,
    createdAt: now,
    firstStartedAt: null,
    startedAt: null,
    stepStartedAt: null,
    finishedAt: null,
    alerts: {},
    tokens: { reported: 0 },
  };
}

function mergedRefusal(state) {
  return new FactoryError(`${state.id} is already merged into ${state.baseBranch}; create a new task instead.`);
}

function nextStepAfter(lastPassed) {
  if (lastPassed === null) return STEPS[0];
  return STEPS[STEPS.indexOf(lastPassed) + 1] ?? null;
}

export function start(state, now) {
  if (state.status === 'merged') throw mergedRefusal(state);
  if (state.status !== 'backlog') {
    throw new FactoryError(`${state.id} cannot start: it is ${state.status}, only backlog tasks can start.`);
  }
  return {
    ...state,
    status: 'in_progress',
    firstStartedAt: state.firstStartedAt ?? now,
    startedAt: now,
    step: null,
    lastPassed: null,
  };
}

// Called by the task runner before each step. Returns { state, signal } where
// signal is 'continue', 'pause' or 'cancel'. A pending pause request is applied
// here, at the step boundary, because a running subagent cannot be frozen mid-step.
export function beginStep(state, step, now) {
  if (!STEPS.includes(step)) throw new FactoryError(`Unknown step "${step}". Valid steps: ${STEPS.join(', ')}.`);
  if (state.status === 'cancelled') return { state, signal: 'cancel' };
  if (state.status !== 'in_progress') {
    throw new FactoryError(`${state.id} cannot begin ${step}: it is ${state.status}.`);
  }
  const expected = nextStepAfter(state.lastPassed);
  if (step !== expected) {
    throw new FactoryError(`${state.id} cannot begin ${step}: the next step in run ${state.run} is ${expected}.`);
  }
  if (state.control === 'pause') {
    return {
      state: { ...state, status: 'paused', control: null, step: null, stepStartedAt: null },
      signal: 'pause',
    };
  }
  return { state: { ...state, step, stepStartedAt: now }, signal: 'continue' };
}

// Records a step's { isApproved, errorMessage } output. Returns { state, signal }:
// 'next' (go to the following step), 'retry' (start a new run at the builder),
// 'merged' (approver finished) or 'error' (run budget exhausted).
export function endStep(state, step, { isApproved, errorMessage }, now) {
  if (state.status === 'cancelled') return { state, signal: 'cancel' };
  if (!['in_progress', 'approved'].includes(state.status) || state.step !== step) {
    throw new FactoryError(`${state.id} cannot end ${step}: the current step is ${state.step ?? 'none'} (${state.status}).`);
  }
  if (isApproved) {
    if (step === 'approver') {
      if (state.status !== 'approved') {
        throw new FactoryError(`${state.id}: the approver must record the PR with "factory approve" before reporting success.`);
      }
      return {
        state: { ...state, status: 'merged', lastPassed: step, step: null, stepStartedAt: null, finishedAt: now, lastError: null },
        signal: 'merged',
      };
    }
    return { state: { ...state, lastPassed: step, step: null, stepStartedAt: null }, signal: 'next' };
  }
  const message = errorMessage?.trim() || `${step} rejected the work without an error message.`;
  if (state.run < state.maxRuns) {
    return {
      state: { ...state, status: 'in_progress', run: state.run + 1, step: null, lastPassed: null, stepStartedAt: null, lastError: { step, run: state.run, message } },
      signal: 'retry',
    };
  }
  return {
    state: { ...state, status: 'error', step: null, stepStartedAt: null, finishedAt: now, lastError: { step, run: state.run, message } },
    signal: 'error',
  };
}

export function approve(state, prUrl) {
  if (state.status !== 'in_progress' || state.step !== 'approver') {
    throw new FactoryError(`${state.id} can only be approved while the approver step is running.`);
  }
  if (!prUrl) throw new FactoryError('approve needs the PR URL (--pr <url>).');
  return { ...state, status: 'approved', prUrl };
}

export function pause(state) {
  if (state.status === 'merged') throw mergedRefusal(state);
  if (state.status === 'paused' || state.control === 'pause') throw new FactoryError(`${state.id} is already paused or pausing.`);
  if (state.status !== 'in_progress') {
    throw new FactoryError(`${state.id} cannot be paused: it is ${state.status}, only in-progress tasks can be paused.`);
  }
  return { ...state, control: 'pause' };
}

// Resumes a paused task, or withdraws a pause request that has not taken effect yet.
// With recover=true it also picks up an in-progress/approved task whose runner died.
// Returns { state, step } with the step the runner must start from.
export function resume(state, { recover = false } = {}) {
  if (state.status === 'merged') throw mergedRefusal(state);
  if (state.status === 'in_progress' && state.control === 'pause' && !recover) {
    return { state: { ...state, control: null }, step: null };
  }
  const resumable = recover ? ['paused', 'in_progress', 'approved'] : ['paused'];
  if (!resumable.includes(state.status)) {
    throw new FactoryError(`${state.id} cannot be resumed: it is ${state.status}${recover ? '' : ', only paused tasks can be resumed'}.`);
  }
  const step = nextStepAfter(state.lastPassed) ?? STEPS[STEPS.length - 1];
  return { state: { ...state, status: 'in_progress', control: null, step: null, stepStartedAt: null }, step };
}

export function cancel(state, now) {
  if (state.status === 'merged') throw mergedRefusal(state);
  if (state.status === 'cancelled') throw new FactoryError(`${state.id} is already cancelled.`);
  return { ...state, status: 'cancelled', control: null, step: null, stepStartedAt: null, finishedAt: now };
}

export function restart(state) {
  if (state.status === 'merged') throw mergedRefusal(state);
  if (['in_progress', 'approved'].includes(state.status)) {
    throw new FactoryError(`${state.id} is running; pause or cancel it before restarting.`);
  }
  if (state.status === 'backlog') throw new FactoryError(`${state.id} has not started yet; there is nothing to restart.`);
  return {
    ...state,
    status: 'backlog',
    run: 1,
    step: null,
    lastPassed: null,
    control: null,
    lastError: null,
    startedAt: null,
    stepStartedAt: null,
    finishedAt: null,
    alerts: {},
    restarts: state.restarts + 1,
  };
}
