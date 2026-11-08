import { STEPS, stepStates, type StepState } from '@/lib/board';
import { STEP_LABEL } from '@/lib/format';
import type { TaskSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

const DOT: Record<StepState, string> = {
  passed: 'bg-status-approved',
  running: 'bg-status-progress ring-2 ring-status-progress/30',
  failed: 'bg-status-error',
  pending: 'bg-muted-foreground/25',
};

export function StepDots({ task, className }: { task: TaskSummary; className?: string }) {
  const states = stepStates(task);
  const label = STEPS.map((s) => `${STEP_LABEL[s]}: ${states[s]}`).join(', ');
  return (
    <div className={cn('flex items-center gap-1', className)} role="img" aria-label={label}>
      {STEPS.map((step) => (
        <span
          key={step}
          title={`${STEP_LABEL[step]} · ${states[step]}`}
          className={cn('h-1.5 flex-1 rounded-full transition-colors', DOT[states[step]], states[step] === 'running' && 'animate-pulse')}
        />
      ))}
    </div>
  );
}
