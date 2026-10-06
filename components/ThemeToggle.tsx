import React, { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const THEME_KEY = 'asistenciapro-theme';

type Theme = 'light' | 'dark';

const getCurrentTheme = (): Theme =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light';

const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  // Brief color transition only while switching
  root.classList.add('theme-transition');
  root.classList.toggle('dark', theme === 'dark');
  window.setTimeout(() => root.classList.remove('theme-transition'), 250);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
};

interface ThemeToggleProps {
  className?: string;
}

/** Botón para alternar entre modo claro y oscuro (se guarda en localStorage). */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const [theme, setTheme] = useState<Theme>(getCurrentTheme);
  const isDark = theme === 'dark';

  const toggle = () => {
    const next: Theme = isDark ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className={`flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors shrink-0 ${className}`}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
};
