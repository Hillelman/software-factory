import { useEffect, useMemo, useRef, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { KeyRound, WifiOff } from 'lucide-react';
import { Board } from '@/components/Board';
import { Header } from '@/components/Header';
import { TaskDrawer } from '@/components/TaskDrawer';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useFactory, useTaskDetail } from '@/hooks/useFactory';
import { useNow } from '@/hooks/useNow';
import { useStoredBoolean } from '@/hooks/useStoredBoolean';
import { useTheme } from '@/hooks/useTheme';
import { readToken } from '@/lib/api';
import { diffAlerts, visibleTasks } from '@/lib/board';
import { chime, notificationsEnabled, osNotify, requestOsNotifications, setNotificationsEnabled, unlockAudio } from '@/lib/notify';
import type { TaskSummary } from '@/lib/types';

function FullScreenMessage({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="rounded-2xl border bg-card p-4 text-muted-foreground shadow-xs">{icon}</div>
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="max-w-sm text-sm text-muted-foreground">{children}</div>
    </main>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid flex-1 grid-cols-1 gap-4 px-4 pt-5 md:grid-cols-3 md:px-6 lg:grid-cols-5" aria-busy="true" aria-label="Loading tasks">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-2xl bg-column p-3 max-md:[&:not(:first-child)]:hidden">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-28 animate-pulse rounded-xl bg-card" />
          <div className="h-28 animate-pulse rounded-xl bg-card" />
        </div>
      ))}
    </div>
  );
}

export function App() {
  const [token] = useState(readToken);
  const feed = useFactory(token);
  const { theme, setTheme } = useTheme();
  const [showPrevious, setShowPrevious] = useStoredBoolean('factory.showPrevious', false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notifyPrefs, setNotifyPrefs] = useState<Record<string, boolean>>({});
  const now = useNow(feed.clockOffset);
  const { detail, error: detailError } = useTaskDetail(token, selectedId, feed.version);
  const previousTasks = useRef<TaskSummary[] | null>(null);

  const notifyFor = (id: string) => notifyPrefs[id] ?? notificationsEnabled(id);
  const tasks = useMemo(() => (feed.state ? visibleTasks(feed.state, showPrevious) : []), [feed.state, showPrevious]);
  const selected = feed.state?.tasks.find((t) => t.id === selectedId) ?? null;

  // Browsers only allow sound (and notification prompts) after a user gesture.
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      requestOsNotifications();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!feed.state) return;
    const alerts = diffAlerts(previousTasks.current, feed.state.tasks, feed.state.stuckMinutes);
    previousTasks.current = feed.state.tasks;
    for (const alert of alerts) {
      if (!(notifyPrefs[alert.id] ?? notificationsEnabled(alert.id))) continue;
      const title = `${alert.id} · ${alert.title}`;
      const action = { label: 'Open', onClick: () => setSelectedId(alert.id) };
      if (alert.kind === 'error' || alert.kind === 'stuck') toast.error(title, { description: alert.message, action, duration: 10_000 });
      else toast.success(title, { description: alert.message, action });
      chime(alert.kind);
      osNotify(title, alert.message);
    }
  }, [feed.state, notifyPrefs]);

  useEffect(() => {
    const running = feed.state?.tasks.filter((t) => t.status === 'in_progress').length ?? 0;
    document.title = running ? `(${running}) Factory · ${feed.state?.project.name}` : `Factory · ${feed.state?.project.name ?? 'Board'}`;
  }, [feed.state]);

  if (feed.authFailed) {
    return (
      <FullScreenMessage icon={<KeyRound className="size-7" />} title="Access token needed">
        Open the full link printed by <code className="rounded bg-muted px-1 font-mono text-xs">/factory:dashboard</code>, or scan the QR code from the board on your computer.
      </FullScreenMessage>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-full flex-col">
        <Header
          project={feed.state?.project.name ?? 'Factory'}
          branch={feed.state?.project.branch ?? null}
          connection={feed.connection}
          showPrevious={showPrevious}
          onShowPreviousChange={setShowPrevious}
          theme={theme}
          onThemeChange={setTheme}
          lanUrls={feed.state?.access.lanUrls ?? []}
        />
        {!feed.state && feed.error ? (
          <FullScreenMessage icon={<WifiOff className="size-7" />} title="Can't reach the factory">
            <p>{feed.error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={feed.retry}>
              Try again
            </Button>
          </FullScreenMessage>
        ) : !feed.state ? (
          <BoardSkeleton />
        ) : (
          <main className="flex flex-1 flex-col">
            <Board
              tasks={tasks}
              now={now}
              showSession={showPrevious}
              notifyFor={notifyFor}
              onNotifyChange={(id, enabled) => {
                setNotificationsEnabled(id, enabled);
                setNotifyPrefs((p) => ({ ...p, [id]: enabled }));
              }}
              onOpen={setSelectedId}
            />
          </main>
        )}
        <TaskDrawer task={selected} detail={detail} error={detailError} now={now} onClose={() => setSelectedId(null)} />
        <Toaster position="bottom-right" richColors closeButton theme={theme} />
      </div>
    </TooltipProvider>
  );
}
