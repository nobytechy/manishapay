import { useState } from 'react';
import { LogOut, Sun, Moon, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Topbar() {
  const { user, profile, signOut } = useAuth();
  const [dark, setDark] = useState(true);
  const [open, setOpen] = useState(false);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 backdrop-blur">
      <div className="text-sm text-slate-400">
        Welcome back, <span className="text-slate-100">{profile?.full_name || user?.email || 'developer'}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          aria-label="Toggle theme"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md border border-slate-700 px-2.5 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            <div className="grid h-6 w-6 place-items-center rounded-full bg-brand text-[10px] font-bold text-slate-950">
              {(profile?.full_name || user?.email || '?').slice(0, 1).toUpperCase()}
            </div>
            <ChevronDown size={14} />
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-52 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl">
              <div className="border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
                {user?.email}
              </div>
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
