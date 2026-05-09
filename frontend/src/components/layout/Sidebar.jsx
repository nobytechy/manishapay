import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  KeyRound,
  FolderKanban,
  Webhook,
  Receipt,
  Wrench,
  BookOpen,
  Settings,
  Users,
  ScrollText,
  Megaphone,
  Activity,
  Lock,
  FlaskConical,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

const developerNav = [
  { to: '/app', icon: LayoutDashboard, label: 'Overview', end: true },
  { to: '/app/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/app/keys', icon: KeyRound, label: 'API Keys' },
  { to: '/app/credentials', icon: Lock, label: 'PayNow Credentials' },
  { to: '/app/webhooks', icon: Webhook, label: 'Webhooks' },
  { to: '/app/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/app/sandbox', icon: FlaskConical, label: 'Sandbox' },
  { to: '/app/tools', icon: Wrench, label: 'Problem solvers' },
  { to: '/app/docs', icon: BookOpen, label: 'Documentation' },
  { to: '/app/settings', icon: Settings, label: 'Settings' },
];

const adminNav = [
  { to: '/admin', icon: LayoutDashboard, label: 'Overview', end: true },
  { to: '/admin/developers', icon: Users, label: 'Developers' },
  { to: '/admin/logs', icon: ScrollText, label: 'Logs' },
  { to: '/admin/webhooks', icon: Activity, label: 'Webhook monitor' },
  { to: '/admin/announcements', icon: Megaphone, label: 'Announcements' },
];

export default function Sidebar() {
  const { isAdmin } = useAuth();
  const items = isAdmin ? adminNav : developerNav;

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900/40 px-4 py-6 md:flex">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <img src="/logo.svg" alt="ManishaPay" className="h-8 w-8 rounded-lg" />
        <div>
          <p className="text-sm font-semibold text-slate-100">ManishaPay</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">PayNow Bridge</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {items.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand/10 text-brand'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-3">
        <p className="text-xs text-slate-400">
          Need help?{' '}
          <a href="mailto:support@manishapay.dev" className="text-brand hover:underline">
            support@manishapay.dev
          </a>
        </p>
      </div>
    </aside>
  );
}
