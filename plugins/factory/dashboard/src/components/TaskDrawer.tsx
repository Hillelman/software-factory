import { useState } from 'react';
import Markdown from 'react-markdown';
import { CheckCircle2, ChevronDown, Circle, CircleX, ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { COLUMN_ACCENT } from '@/components/statusStyles';
import { COLUMNS, columnOf, timeline, type StepState, type TimelineRun } from '@/lib/board';
import { elapsedMs, formatDateTime, formatDuration, formatTime, formatTokens, STEP_LABEL } from '@/lib/format';
import type { FactoryEvent, Step, TaskDetail, TaskSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

const STATE_ICON: Record<StepState, React.ReactNode> = {
  passed: <CheckCircle2 className="size-4 text-status-approved" />,
  failed: <CircleX className="size-4 text-status-error" />,
  running: <Loader2 className="size-4 animate-spin text-status-progress" />,
  pending: <Circle className="size-4 text-muted-foreground/40" />,
};

const prose =
  'max-w-none text-sm leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-medium [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5';

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function StepRow({ run, entry, report, now }: { run: number; entry: TimelineRun['steps'][number]; report?: string; now: number }) {
  const [open, setOpen] = useState(entry.state === 'failed');
  const duration = entry.startedAt ? elapsedMs(entry.startedAt, entry.finishedAt, now) : null;
  return (
    <li className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!report && !entry.errorMessage}
        aria-expanded={open}
        aria-label={`Run ${run} ${STEP_LABEL[entry.step]}`}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:cursor-default"
      >
        {STATE_ICON[entry.state]}
        <span className="flex-1 text-sm font-medium">{STEP_LABEL[entry.step]}</span>
        {duration !== null && <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(duration)}</span>}
        {(report || entry.errorMessage) && <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />}
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t px-3 py-3">
          {entry.errorMessage && (
            <pre className="overflow-x-auto rounded-md bg-status-error/10 p-2.5 font-mono text-xs whitespace-pre-wrap text-status-error">{entry.errorMessage}</pre>
          )}
          {report && (
            <div className={prose}>
              <Markdown>{report}</Markdown>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function eventText(e: FactoryEvent): string {
  switch (e.type) {
    case 'step_started':
      return `${STEP_LABEL[e.step ?? ''] ?? e.step} started (run ${e.run})`;
    case 'step_finished':
      return `${STEP_LABEL[e.step ?? ''] ?? e.step} ${e.isApproved ? 'approved' : 'rejected'}${e.errorMessage ? `: ${e.errorMessage}` : ''}`;
    case 'approved':
      return `PR opened ${e.prUrl ?? ''}`;
    case 'restarted':
      return `Restarted${e.prompt ? `: ${e.prompt}` : ''}`;
    default:
      return e.message ?? e.type.replace(/_/g, ' ');
  }
}

const EVENT_TONE: Record<string, string> = {
  stuck: 'text-status-error',
  cancelled: 'text-status-error',
  approved: 'text-status-approved',
};

interface Props {
  task: TaskSummary | null;
  detail: TaskDetail | null;
  error: string | null;
  now: number;
  onClose: () => void;
}

export function TaskDrawer({ task, detail, error, now, onClose }: Props) {
  const column = task ? COLUMNS.find((c) => c.id === columnOf(task.status)) : undefined;
  const runs = detail ? timeline(detail.events) : [];
  const elapsed = task ? elapsedMs(task.startedAt, task.finishedAt, now) : null;

  return (
    <Sheet open={Boolean(task)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {task && (
          <>
            <div className="flex flex-col gap-3 border-b px-5 pt-5 pb-4 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
                {column && (
                  <Badge variant="outline" className="gap-1.5">
                    <span className={cn('size-1.5 rounded-full', COLUMN_ACCENT[column.id].dot)} />
                    {task.status === 'paused' ? 'Paused' : task.status === 'cancelled' ? 'Cancelled' : column.label}
                  </Badge>
                )}
                {task.stuckLevel > 0 && task.status === 'in_progress' && (
                  <Badge variant="destructive">
                    <TriangleAlert /> Slow step
                  </Badge>
                )}
              </div>
              <SheetTitle className="text-lg leading-snug font-semibold">{task.title}</SheetTitle>
              <SheetDescription className="sr-only">Workflow steps, reports and logs for {task.id}</SheetDescription>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Meta label="Step">{task.step ? STEP_LABEL[task.step] : task.status === 'merged' ? 'Done' : '—'}</Meta>
                <Meta label="Run">
                  {task.run}/{task.maxRuns}
                </Meta>
                <Meta label="Time">{elapsed === null ? '—' : formatDuration(elapsed)}</Meta>
                <Meta label={task.tokens.estimated ? 'Tokens (est.)' : 'Tokens'}>{task.tokens.total ? formatTokens(task.tokens.total) : '—'}</Meta>
              </dl>
              {task.prUrl && (
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <a href={task.prUrl} target="_blank" rel="noreferrer noopener">
                    View pull request <ExternalLink />
                  </a>
                </Button>
              )}
            </div>

            {task.lastError && (
              <div className="mx-5 mt-4 rounded-lg border border-status-error/30 bg-status-error/8 p-3">
                <p className="text-xs font-semibold text-status-error">
                  {STEP_LABEL[task.lastError.step]} rejected run {task.lastError.run}
                </p>
                <p className="mt-1 text-sm break-words whitespace-pre-wrap">{task.lastError.message}</p>
              </div>
            )}

            <Tabs defaultValue="steps" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="mx-5 mt-4 grid grid-cols-3">
                <TabsTrigger value="steps">Steps</TabsTrigger>
                <TabsTrigger value="task">Task</TabsTrigger>
                <TabsTrigger value="log">Log</TabsTrigger>
              </TabsList>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {error && <p className="text-sm text-status-error">Could not load details: {error}</p>}
                {!detail && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
                {detail && (
                  <>
                    <TabsContent value="steps" className="flex flex-col gap-5 outline-none">
                      {runs.length === 0 && <p className="text-sm text-muted-foreground">No steps have run yet.</p>}
                      {[...runs].reverse().map((r) => (
                        <section key={r.run} className="flex flex-col gap-2">
                          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Run {r.run}</h3>
                          <ol className="flex flex-col gap-1.5">
                            {r.steps.map((entry) => (
                              <StepRow key={entry.step} run={r.run} entry={entry} report={detail.runs[String(r.run)]?.[entry.step as Step]} now={now} />
                            ))}
                          </ol>
                        </section>
                      ))}
                    </TabsContent>
                    <TabsContent value="task" className={cn(prose, 'outline-none')}>
                      <Markdown>{detail.taskMd}</Markdown>
                    </TabsContent>
                    <TabsContent value="log" className="outline-none">
                      {detail.events.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No events yet.</p>
                      ) : (
                        <ol className="flex flex-col font-mono text-xs">
                          {[...detail.events].reverse().map((e, i) => (
                            <li key={`${e.ts}-${i}`} className="flex gap-3 border-b border-border/60 py-1.5 last:border-0">
                              <time className="shrink-0 text-muted-foreground" dateTime={e.ts} title={formatDateTime(e.ts)}>
                                {formatTime(e.ts)}
                              </time>
                              <span className={cn('break-words', EVENT_TONE[e.type], e.type === 'step_finished' && !e.isApproved && 'text-status-error')}>
                                {eventText(e)}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </TabsContent>
                  </>
                )}
              </div>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
