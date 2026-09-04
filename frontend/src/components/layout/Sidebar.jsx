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
  ShieldCheck,
  FlaskConical,
  Mail,
  Phone,
  MessageCircle,
  Rocket,
  Link2,
  CreditCard,
  Repeat,
  Plug,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

const developerNav = [
  { to: '/app', icon: LayoutDashboard, label: 'Overview', end: true },
  { to: '/app/connect', icon: Rocket, label: 'Connect Your App' },
  { to: '/app/links', icon: Link2, label: 'Payment Links' },
  { to: '/app/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/app/keys', icon: KeyRound, label: 'API Keys' },
  { to: '/app/methods', icon: Plug, label: 'Payment Methods' },
  { to: '/app/webhooks', icon: Webhook, label: 'Webhooks' },
  { to: '/app/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/app/fiscalise', icon: ScrollText, label: 'Fiscalisation' },
  { to: '/app/health', icon: Activity, label: 'Health' },
  { to: '/app/billing', icon: CreditCard, label: 'Billing' },
  { to: '/app/subscriptions', icon: Repeat, label: 'Subscriptions' },
  { to: '/app/team', icon: Users, label: 'Team' },
  { to: '/app/sandbox', icon: FlaskConical, label: 'Sandbox' },
  { to: '/app/tools', icon: Wrench, label: 'Problem solvers' },
  { to: '/app/docs', icon: BookOpen, label: 'Documentation' },
  { to: '/app/support', icon: MessageCircle, label: 'Support' },
  { to: '/app/settings', icon: Settings, label: 'Settings' },
];

const adminNav = [
  { to: '/admin', icon: LayoutDashboard, label: 'Overview', end: true },
  { to: '/admin/developers', icon: Users, label: 'Developers' },
  { to: '/admin/logs', icon: ScrollText, label: 'Logs' },
  { to: '/admin/webhooks', icon: Activity, label: 'Webhook monitor' },
  { to: '/admin/audit', icon: ShieldCheck, label: 'Audit trail' },
  { to: '/admin/support', icon: MessageCircle, label: 'Support / Queries' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
  { to: '/admin/announcements', icon: Megaphone, label: 'Announcements' },
];

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { isAdmin } = useAuth();
  const items = isAdmin ? adminNav : developerNav;

  return (
    <>
      {/* Mobile backdrop — tap to close */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-900 px-4 py-6 transition-transform duration-200 ease-out',
          'md:static md:z-auto md:translate-x-0 md:bg-slate-900/40',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="ManishaPay" className="h-8 w-8 rounded-lg" />
            <div>
              <p className="text-sm font-semibold text-slate-100">ManishaPay</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Payments API</p>
            </div>
          </div>
          {/* Close button — mobile only */}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 md:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1">
          {items.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
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
        <p className="mb-2 text-xs font-medium text-slate-300">Need help?</p>
        <div className="space-y-1.5 text-xs">
          <a
            href="mailto:nobytechy@gmail.com"
            className="flex items-center gap-2 text-slate-400 hover:text-brand"
          >
            <Mail size={13} /> nobytechy@gmail.com
          </a>
          <a
            href="tel:+263774603865"
            className="flex items-center gap-2 text-slate-400 hover:text-brand"
          >
            <Phone size={13} /> +263 77 460 3865
          </a>
          <a
            href="https://wa.me/263774603865"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-slate-400 hover:text-brand-400"
          >
            <MessageCircle size={13} /> WhatsApp
          </a>
        </div>
      </div>
      </aside>
    </>
  );
}
