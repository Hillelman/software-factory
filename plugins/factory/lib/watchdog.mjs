// Detects workflow steps that have been running longer than the configured threshold.
// Each step alerts once at the threshold and once more at twice the threshold.
import { notifyOs } from './notify.mjs';

export function findStuck(states, now, thresholdMinutes) {
  const thresholdMs = thresholdMinutes * 60_000;
  return states.flatMap((state) => {
    if (state.status !== 'in_progress' || !state.step || !state.stepStartedAt) return [];
    const elapsed = now - Date.parse(state.stepStartedAt);
    const level = elapsed >= 2 * thresholdMs ? 2 : elapsed >= thresholdMs ? 1 : 0;
    const key = `${state.run}:${state.step}`;
    if (level === 0 || (state.alerts?.[key] ?? 0) >= level) return [];
    return [{ id: state.id, title: state.title, step: state.step, run: state.run, key, level, minutes: Math.floor(elapsed / 60_000) }];
  });
}

export function checkOnce(store, now = Date.now(), { notify = notifyOs, log = console.log } = {}) {
  const { stuckMinutes } = store.config();
  const states = store.taskIds().filter((id) => store.hasTask(id)).map((id) => store.readTask(id));
  const stuck = findStuck(states, now, stuckMinutes);
  for (const hit of stuck) {
    // Re-check under the lock: the hook and the monitor may race on the same alert.
    const { skip } = store.updateTask(hit.id, (s) => {
      if (s.step !== hit.step || s.run !== hit.run || (s.alerts?.[hit.key] ?? 0) >= hit.level) return { state: s, skip: true };
      return { state: { ...s, alerts: { ...s.alerts, [hit.key]: hit.level } }, skip: false };
    });
    if (skip) continue;
    const message = `${hit.id} "${hit.title}": ${hit.step} has been running for ${hit.minutes} min (run ${hit.run}).`;
    store.appendEvent(hit.id, { type: 'stuck', step: hit.step, run: hit.run, minutes: hit.minutes, message });
    notify('Factory: step running long', message);
    log(`[factory] STUCK ${message} Check it with /factory:status or pause it with /factory:pause ${hit.id}.`);
  }
  return stuck;
}
