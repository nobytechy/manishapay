/**
 * Reusable docs / reference layout: collapsible sidebar nav + main panel.
 *
 * Usage:
 *   <SidebarDoc
 *     headerTitle="Forum coverage"
 *     headerSubtitle="..."
 *     groups={[
 *       { label: 'Direct fixes', items: [
 *           { id: 'hash', label: 'Hash mismatch', content: <HashSection/> },
 *           ...
 *         ] },
 *       ...
 *     ]}
 *   />
 *
 * - URL hash (#hash) is read on mount + updated on selection so deep-links
 *   land users on the right section.
 * - On mobile (<md), the sidebar collapses into a top dropdown so the main
 *   content takes full width.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Menu, X } from 'lucide-react';
import BackToTop from './BackToTop';

export default function SidebarDoc({
  headerTitle,
  headerSubtitle,
  groups,
  defaultActive,
  topRight = null,
}) {
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const fallback = defaultActive || allItems[0]?.id;
  const [active, setActive] = useState(fallback);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Read URL hash on mount + sync on change.
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h && allItems.some((i) => i.id === h)) setActive(h);
  }, [allItems]);

  const onSelect = (id) => {
    setActive(id);
    setMobileOpen(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const activeItem = allItems.find((i) => i.id === active) || allItems[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-100">
              <ArrowLeft size={14}/> Home
            </Link>
            <span className="text-slate-700">|</span>
            <Link to="/" className="flex items-center gap-2">
              <img src="/logo.svg" alt="ManishaPay" className="h-7 w-7 rounded-md"/>
              <span className="text-sm font-semibold tracking-tight">ManishaPay</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {topRight}
            <button
              type="button"
              className="md:hidden rounded-md border border-slate-800 bg-slate-900 p-1.5 text-slate-300 hover:text-white"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X size={18}/> : <Menu size={18}/>}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* Sidebar */}
        <aside
          className={`${mobileOpen ? 'block' : 'hidden'} md:block sticky top-[57px] z-30 h-[calc(100vh-57px)] w-full shrink-0 overflow-y-auto border-r border-slate-800/60 bg-slate-950/95 px-6 py-8 md:w-72`}
        >
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">{headerTitle}</h1>
          {headerSubtitle && <p className="mt-1 text-xs leading-relaxed text-slate-500">{headerSubtitle}</p>}

          <nav className="mt-6 space-y-6">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(item.id)}
                        className={`block w-full rounded-md px-3 py-1.5 text-left text-sm transition ${
                          active === item.id
                            ? 'bg-brand/10 text-brand-300'
                            : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className={`${mobileOpen ? 'hidden' : 'block'} flex-1 px-6 py-12 md:px-12`}>
          <div className="mx-auto max-w-3xl">
            {activeItem ? activeItem.content : null}
          </div>
        </main>
      </div>

      <BackToTop />
    </div>
  );
}
