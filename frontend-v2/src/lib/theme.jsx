// Theme context — dark / light / spacex.
// The initial theme is already applied to <html> by the anti-flash script in
// index.html; here we just read it, expose it to React, and persist changes.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const KEY = 'casa-davinci-theme';
const THEMES = ['dark', 'light', 'spacex'];
const ThemeCtx = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const current = document.documentElement.getAttribute('data-theme');
    return THEMES.includes(current) ? current : 'dark';
  });

  // Reflect theme onto <html> + persist it.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (e) { /* storage blocked */ }
  }, [theme]);

  const setTheme = useCallback((t) => { if (THEMES.includes(t)) setThemeState(t); }, []);

  return <ThemeCtx.Provider value={{ theme, setTheme, themes: THEMES }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
