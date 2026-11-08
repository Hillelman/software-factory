import { Ban, Bell, BellOff, Clock, Cpu, GitPullRequest, Pause, Repeat, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { StepDots } from '@/components/StepDots';
import { elapsedMs, formatDuration, formatTokens, STEP_LABEL } from '@/lib/format';
import type { TaskSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  task: TaskSummary;
  now: number;
  notify: boolean;
  onNotifyChange: (enabled: boolean) => void;
  onOpen: () => void;
  showSession: boolean;
}

function stepLabel(task: TaskSummary): string {
  if (task.status === 'merged') return 'Done';
  if (task.status === 'backlog') return task.dependsOn.length ? `Waiting on ${task.dependsOn.join(', ')}` : 'Queued';
  if (task.status === 'paused') return 'Paused';
  if (task.status === 'cancelled') return 'Cancelled';
  if (task.status === 'error') return task.lastError ? `Failed at ${STEP_LABEL[task.lastError.step]}` : 'Failed';
  if (task.control === 'pause') return `${task.step ? STEP_LABEL[task.step] : 'Starting'} · pausing`;
  return task.step ? STEP_LABEL[task.step] ?? task.step : 'Starting';
}

export function TaskCard({ task, now, notify, onNotifyChange, onOpen, showSession }: Props) {
  const elapsed = elapsedMs(task.startedAt, task.finishedAt, now);
  const stuck = task.stuckLevel > 0 && task.status === 'in_progress';
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`${task.id} ${task.title}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col gap-3 rounded-xl border bg-card p-3.5 text-card-foreground shadow-xs transition-all',
        'hover:-translate-y-px hover:border-foreground/15 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        stuck && 'border-status-error/40 animate-pulse-ring',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs font-medium text-muted-foreground">{task.id}</span>
          {showSession && (
            <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
              {task.sessionId}
            </Badge>
          )}
          {task.status === 'paused' && (
            <Badge variant="secondary">
              <Pause /> Paused
            </Badge>
          )}
          {task.status === 'cancelled' && (
            <Badge variant="secondary">
              <Ban /> Cancelled
            </Badge>
          )}
          {stuck && (
            <Badge variant="destructive">
              <TriangleAlert /> Slow step
            </Badge>
          )}
        </div>
        <label
          className="flex shrink-0 items-center gap-1.5 text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          title={notify ? 'Notifications on' : 'Notifications off'}
        >
          {notify ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
          <Switch checked={notify} onCheckedChange={onNotifyChange} aria-label={`Notifications for ${task.id}`} className="scale-90" />
        </label>
      </header>

      <h3 className="line-clamp-2 text-sm leading-snug font-medium">{task.title}</h3>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className={cn('font-medium', task.status === 'error' ? 'text-status-error' : 'text-foreground/80')}>{stepLabel(task)}</span>
          {task.run > 1 && (
            <span className="flex items-center gap-1 text-muted-foreground" title="Workflow run">
              <Repeat className="size-3" /> {task.run}/{task.maxRuns}
            </span>
          )}
        </div>
        {task.status !== 'backlog' && <StepDots task={task} />}
      </div>

      <footer className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
        <span className="flex items-center gap-1" title="Time since the task started">
          <Clock className="size-3.5" />
          {elapsed === null ? '—' : formatDuration(elapsed)}
        </span>
        <span className="flex items-center gap-1" title={task.tokens.estimated ? 'Tokens (estimated from transcripts)' : 'Tokens reported'}>
          <Cpu className="size-3.5" />
          {task.tokens.total ? `${task.tokens.estimated ? '~' : ''}${formatTokens(task.tokens.total)}` : '—'}
        </span>
        {task.prUrl && (
          <a
            href={task.prUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto flex items-center gap-1 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <GitPullRequest className="size-3.5" /> PR
          </a>
        )}
      </footer>
    </article>
  );
}
