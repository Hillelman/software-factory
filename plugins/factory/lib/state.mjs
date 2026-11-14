// Pure task state machine. Every function takes a state and returns a new one,
// or throws FactoryError with a message meant to be shown to the user as-is.

export const STEPS = ['builder', 'cleaner', 'checker', 'tester', 'approver'];
export const STATUSES = ['backlog', 'in_progress', 'paused', 'approved', 'merged', 'error', 'cancelled'];
export const DEFAULT_MAX_RUNS = 2;
// The checker and tester run side by side once the cleaner has passed.
export const PARALLEL_STEPS = ['checker', 'tester'];

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
    activeSteps: [],
    stepResults: {},
    skipped: [],
    hasCode: true,
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

// State fields that only matter within one run. Older state files lack them, so every reader tolerates undefined.
const RUN_RESET = { step: null, activeSteps: [], stepResults: {}, skipped: [], hasCode: true, lastPassed: null, stepStartedAt: null };

// Steps currently running: the parallel pair, or the single `step` (also how older state files record it).
const activeOf = (state) => (state.activeSteps?.length ? state.activeSteps : state.step ? [state.step] : []);

const inParallelPhase = (state, step) => PARALLEL_STEPS.includes(step) && state.lastPassed === 'cleaner';

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
    ...RUN_RESET,
  };
}

// Called by the task runner before each step. Returns { state, signal } where
// signal is 'continue', 'pause', 'cancel' or 'skip' (the step is skipped or already passed in this run).
// A pending pause request is applied here, at the step boundary, because a running
// subagent cannot be frozen mid-step. After the cleaner, the checker and tester may both
// be active at once; a pause requested between their two begin calls waits for the approver.
export function beginStep(state, step, now) {
  if (!STEPS.includes(step)) throw new FactoryError(`Unknown step "${step}". Valid steps: ${STEPS.join(', ')}.`);
  if (state.status === 'cancelled') return { state, signal: 'cancel' };
  if (state.status !== 'in_progress') {
    throw new FactoryError(`${state.id} cannot begin ${step}: it is ${state.status}.`);
  }
  if (state.skipped?.includes(step)) return { state, signal: 'skip' };
  const parallel = inParallelPhase(state, step);
  const running = activeOf(state);
  if (parallel) {
    if (state.stepResults?.[step]?.isApproved) return { state, signal: 'skip' };
    if (state.stepResults?.[step]) throw new FactoryError(`${state.id} cannot begin ${step}: it already reported in run ${state.run}.`);
  } else {
    const expected = nextStepAfter(state.lastPassed);
    if (step !== expected) {
      throw new FactoryError(`${state.id} cannot begin ${step}: the next step in run ${state.run} is ${expected}.`);
    }
  }
  const joiningPair = parallel && running.some((s) => s !== step);
  if (state.control === 'pause' && !joiningPair) {
    return {
      state: { ...state, status: 'paused', control: null, step: null, activeSteps: [], stepStartedAt: null },
      signal: 'pause',
    };
  }
  if (!parallel) return { state: { ...state, step, activeSteps: [], stepStartedAt: now }, signal: 'continue' };
  const activeSteps = [...new Set([...running, step])];
  return {
    state: { ...state, step: activeSteps[0], activeSteps, stepStartedAt: running.length ? state.stepStartedAt : now },
    signal: 'continue',
  };
}

function failRun(state, step, message, now) {
  const lastError = { step, run: state.run, message };
  if (state.run < state.maxRuns) {
    return { state: { ...state, ...RUN_RESET, status: 'in_progress', run: state.run + 1, lastError }, signal: 'retry' };
  }
  return { state: { ...state, status: 'error', step: null, activeSteps: [], stepResults: {}, stepStartedAt: null, finishedAt: now, lastError }, signal: 'error' };
}

// A checker or tester result while both belong to the same run. The run is only judged
// once both have reported, so one failing step never hides the other's message.
function endParallelStep(state, step, isApproved, message, now) {
  const stepResults = { ...state.stepResults, [step]: { isApproved, errorMessage: message } };
  const stillActive = activeOf(state).filter((s) => s !== step);
  if (stillActive.length) {
    return { state: { ...state, stepResults, activeSteps: stillActive, step: stillActive[0] }, signal: 'wait' };
  }
  const reported = PARALLEL_STEPS.filter((s) => stepResults[s]);
  if (reported.length < PARALLEL_STEPS.length) {
    // The other step has not begun, so the two are running one after the other.
    if (!isApproved) return failRun(state, step, message, now);
    if (step === 'checker') return { state: { ...state, lastPassed: step, step: null, activeSteps: [], stepResults: {}, stepStartedAt: null }, signal: 'next' };
    return { state: { ...state, stepResults, step: null, activeSteps: [], stepStartedAt: null }, signal: 'next' };
  }
  const failed = PARALLEL_STEPS.filter((s) => !stepResults[s].isApproved);
  if (failed.length) return failRun(state, failed[0], failed.map((s) => `${s}: ${stepResults[s].errorMessage}`).join(' | '), now);
  return { state: { ...state, lastPassed: 'tester', step: null, activeSteps: [], stepResults: {}, stepStartedAt: null }, signal: 'next' };
}

// Records a step's { isApproved, errorMessage } output. Returns { state, signal }:
// 'next' (go to the following step), 'wait' (the other parallel step is still running),
// 'retry' (start a new run at the builder), 'merged' (approver finished) or 'error' (run budget exhausted).
// The builder may add hasCode; the cleaner may add skipVerification to skip the checker and tester.
export function endStep(state, step, { isApproved, errorMessage, hasCode, skipVerification = false }, now) {
  if (state.status === 'cancelled') return { state, signal: 'cancel' };
  if (!['in_progress', 'approved'].includes(state.status) || !activeOf(state).includes(step)) {
    throw new FactoryError(`${state.id} cannot end ${step}: the current step is ${state.step ?? 'none'} (${state.status}).`);
  }
  const message = errorMessage?.trim() || `${step} rejected the work without an error message.`;
  if (inParallelPhase(state, step)) return endParallelStep(state, step, isApproved, message, now);
  if (isApproved) {
    if (step === 'approver') {
      if (state.status !== 'approved') {
        throw new FactoryError(`${state.id}: the approver must record the PR with "factory approve" before reporting success.`);
      }
      return {
        state: { ...state, status: 'merged', lastPassed: step, step: null, activeSteps: [], stepStartedAt: null, finishedAt: now, lastError: null },
        signal: 'merged',
      };
    }
    const passed = { ...state, lastPassed: step, step: null, activeSteps: [], stepStartedAt: null };
    if (step === 'builder') passed.hasCode = hasCode !== false;
    if (step === 'cleaner' && skipVerification) {
      passed.lastPassed = 'tester';
      passed.skipped = [...PARALLEL_STEPS];
    }
    return { state: passed, signal: 'next' };
  }
  return failRun(state, step, message, now);
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
// Returns { state, step, steps } with the step the runner must start from; steps lists every
// step to start (the checker and tester that have not passed yet, during the parallel phase).
export function resume(state, { recover = false } = {}) {
  if (state.status === 'merged') throw mergedRefusal(state);
  if (state.status === 'in_progress' && state.control === 'pause' && !recover) {
    return { state: { ...state, control: null }, step: null, steps: [] };
  }
  const resumable = recover ? ['paused', 'in_progress', 'approved'] : ['paused'];
  if (!resumable.includes(state.status)) {
    throw new FactoryError(`${state.id} cannot be resumed: it is ${state.status}${recover ? '' : ', only paused tasks can be resumed'}.`);
  }
  const next = nextStepAfter(state.lastPassed) ?? STEPS[STEPS.length - 1];
  const steps = state.lastPassed === 'cleaner' ? PARALLEL_STEPS.filter((s) => !state.stepResults?.[s]?.isApproved) : [next];
  const stepResults = Object.fromEntries(Object.entries(state.stepResults ?? {}).filter(([, r]) => r.isApproved));
  return {
    state: { ...state, status: 'in_progress', control: null, step: null, activeSteps: [], stepResults, stepStartedAt: null },
    step: steps[0],
    steps,
  };
}

export function cancel(state, now) {
  if (state.status === 'merged') throw mergedRefusal(state);
  if (state.status === 'cancelled') throw new FactoryError(`${state.id} is already cancelled.`);
  return { ...state, status: 'cancelled', control: null, step: null, activeSteps: [], stepStartedAt: null, finishedAt: now };
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
    ...RUN_RESET,
    control: null,
    lastError: null,
    startedAt: null,
    finishedAt: null,
    alerts: {},
    restarts: state.restarts + 1,
  };
}
