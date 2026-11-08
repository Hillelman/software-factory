import { useEffect, useState } from 'react';

// Current time corrected by the server clock offset, re-rendering every `intervalMs`.
export function useNow(offset: number, intervalMs = 1000): number {
  const [tick, setTick] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick + offset;
}
