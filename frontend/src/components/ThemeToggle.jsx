import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { getTheme, setTheme } from '../lib/theme';

/* Shared dark/light toggle — used in the dashboard top bar and the landing nav. */
export default function ThemeToggle({ className }) {
  const [dark, setDark] = useState(getTheme() === 'dark');
  const toggle = () => {
    const next = !dark;
    setDark(next);
    setTheme(next ? 'dark' : 'light');
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light or dark theme"
      title={dark ? 'Switch to light' : 'Switch to dark'}
      className={className || 'rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100'}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
