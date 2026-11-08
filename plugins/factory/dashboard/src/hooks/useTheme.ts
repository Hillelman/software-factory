import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'factory.theme';

function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(stored);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    try {
      if (theme === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      // Storage blocked: the theme still applies for this visit.
    }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return { theme, setTheme };
}
