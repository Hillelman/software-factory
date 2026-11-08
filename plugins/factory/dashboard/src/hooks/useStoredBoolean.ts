import { useCallback, useState } from 'react';

export function useStoredBoolean(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : raw === 'true';
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // Storage blocked: keep the in-memory value.
      }
    },
    [key],
  );
  return [value, update];
}
