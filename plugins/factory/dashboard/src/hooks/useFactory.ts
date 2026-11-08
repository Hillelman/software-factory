import { useEffect, useState } from 'react';
import { AuthError, eventsUrl, fetchState, fetchTask } from '@/lib/api';
import type { FactoryState, TaskDetail } from '@/lib/types';

export type Connection = 'connecting' | 'live' | 'offline';

export interface FactoryFeed {
  state: FactoryState | null;
  error: string | null;
  authFailed: boolean;
  connection: Connection;
  clockOffset: number; // serverTime - local time, so timers are right on devices with skewed clocks
  version: number; // bumps on every server change, so detail views know to refetch
  retry: () => void;
}

export function useFactory(token: string | null): FactoryFeed {
  const [state, setState] = useState<FactoryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authFailed, setAuthFailed] = useState(!token);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [clockOffset, setClockOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return undefined;
    let inflight: AbortController | null = null;
    const load = () => {
      inflight?.abort();
      const ctrl = new AbortController();
      inflight = ctrl;
      fetchState(token, ctrl.signal)
        .then((next) => {
          setState(next);
          setClockOffset(Date.parse(next.serverTime) - Date.now());
          setError(null);
          setVersion((v) => v + 1);
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return;
          if (err instanceof AuthError) setAuthFailed(true);
          else setError(err instanceof Error ? err.message : String(err));
        });
    };
    load();
    const source = new EventSource(eventsUrl(token));
    let timer: ReturnType<typeof setTimeout> | undefined;
    source.addEventListener('open', () => {
      setConnection('live');
      load(); // catch up on anything missed while disconnected
    });
    source.addEventListener('change', () => {
      clearTimeout(timer);
      timer = setTimeout(load, 100);
    });
    source.addEventListener('error', () => setConnection(source.readyState === EventSource.CLOSED ? 'offline' : 'connecting'));
    // Timers on cards tick locally; this slow poll is only a safety net for missed events.
    const poll = setInterval(load, 30_000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      source.close();
      inflight?.abort();
    };
  }, [token, attempt]);

  return { state, error, authFailed, connection, clockOffset, version, retry: () => setAttempt((a) => a + 1) };
}

export function useTaskDetail(token: string | null, id: string | null, version: number) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return undefined;
    const ctrl = new AbortController();
    fetchTask(token, id, ctrl.signal)
      .then((d) => {
        setDetail(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      });
    return () => ctrl.abort();
  }, [token, id, version]);

  return { detail: detail?.task.id === id ? detail : null, error };
}
