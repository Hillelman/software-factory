import { Inbox } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TaskCard } from '@/components/TaskCard';
import { COLUMN_ACCENT } from '@/components/statusStyles';
import { COLUMNS, groupByColumn } from '@/lib/board';
import type { ColumnId, TaskSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  tasks: TaskSummary[];
  now: number;
  showSession: boolean;
  notifyFor: (id: string) => boolean;
  onNotifyChange: (id: string, enabled: boolean) => void;
  onOpen: (id: string) => void;
}

function ColumnBody({ tasks, ...props }: Omit<Props, 'tasks'> & { tasks: TaskSummary[] }) {
  if (tasks.length === 0) {
    return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">No tasks</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {tasks.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          now={props.now}
          showSession={props.showSession}
          notify={props.notifyFor(t.id)}
          onNotifyChange={(v) => props.onNotifyChange(t.id, v)}
          onOpen={() => props.onOpen(t.id)}
        />
      ))}
    </div>
  );
}

function ColumnHeader({ id, label, count }: { id: ColumnId; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className={cn('size-2 rounded-full', COLUMN_ACCENT[id].dot)} />
      <h2 className="text-sm font-semibold">{label}</h2>
      <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">{count}</span>
    </div>
  );
}

export function Board(props: Props) {
  const groups = groupByColumn(props.tasks);

  if (props.tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
        <div className="rounded-2xl border bg-card p-4 shadow-xs">
          <Inbox className="size-7 text-muted-foreground" />
        </div>
        <h2 className="text-base font-semibold">No tasks yet</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/factory &lt;idea&gt;</code> in Claude Code. Tasks show up here as soon as the orchestrator creates them.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Phones: one column at a time. */}
      <Tabs defaultValue="in_progress" className="flex flex-col gap-3 px-4 pt-3 pb-8 md:hidden">
        <TabsList className="sticky top-14 z-10 grid h-auto w-full grid-cols-5 shadow-sm">
          {COLUMNS.map((c) => (
            <TabsTrigger key={c.id} value={c.id} className="flex-col gap-0.5 px-1 py-1.5 text-[11px]" aria-label={c.label}>
              <span className="flex items-center gap-1">
                <span className={cn('size-1.5 rounded-full', COLUMN_ACCENT[c.id].dot)} />
                <span className="tabular-nums">{groups[c.id].length}</span>
              </span>
              <span className="truncate">{c.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {COLUMNS.map((c) => (
          <TabsContent key={c.id} value={c.id} className="outline-none">
            <ColumnBody {...props} tasks={groups[c.id]} />
          </TabsContent>
        ))}
      </Tabs>

      {/* Tablets: horizontal snap scroll. Desktops: all five columns side by side. */}
      <div className="hidden flex-1 snap-x snap-mandatory gap-4 overflow-x-auto px-6 pt-5 pb-8 md:flex lg:grid lg:snap-none lg:grid-cols-5 lg:overflow-visible">
        {COLUMNS.map((c) => (
          <section key={c.id} aria-label={c.label} className="flex w-72 shrink-0 snap-start flex-col gap-3 rounded-2xl bg-column p-3 lg:w-auto lg:min-w-0">
            <ColumnHeader id={c.id} label={c.label} count={groups[c.id].length} />
            <ColumnBody {...props} tasks={groups[c.id]} />
          </section>
        ))}
      </div>
    </>
  );
}
