import { STEPS, stepStates, type StepState } from '@/lib/board';
import { STEP_LABEL } from '@/lib/format';
import type { TaskSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

const DOT: Record<StepState, string> = {
  passed: 'bg-status-approved',
  running: 'bg-status-progress ring-2 ring-status-progress/30',
  failed: 'bg-status-error',
  pending: 'bg-muted-foreground/25',
  skipped: 'bg-muted-foreground/25 opacity-60 [background-image:repeating-linear-gradient(135deg,transparent_0_2px,var(--background)_2px_3px)]',
};

export function StepDots({ task, className }: { task: TaskSummary; className?: string }) {
  const states = stepStates(task);
  return (
    <div className={cn('flex items-center gap-1', className)} role="group" aria-label="Workflow steps">
      {STEPS.map((step) => (
        <span
          key={step}
          role="img"
          aria-label={`${STEP_LABEL[step]}: ${states[step]}`}
          title={`${STEP_LABEL[step]} · ${states[step]}`}
          className={cn('h-1.5 flex-1 rounded-full transition-colors', DOT[states[step]], states[step] === 'running' && 'animate-pulse')}
        />
      ))}
    </div>
  );
}
