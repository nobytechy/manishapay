/**
 * Floating "Back to top" button — appears once the user has scrolled past
 * the threshold, fades back out at the top. Smooth-scrolls to 0 on click.
 *
 * Position default sits below the WhatsApp button on Landing; pass `bottom`
 * to override on pages without WhatsApp (e.g. docs, forum-coverage).
 */
import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export default function BackToTop({ threshold = 320, bottom = 24 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  const click = () => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={click}
      aria-label="Back to top"
      className={`group fixed right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-slate-300 shadow-lg backdrop-blur transition-all duration-300 hover:scale-105 hover:bg-slate-800 hover:text-white ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
      style={{ bottom }}
    >
      <ArrowUp size={18} />
      <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 opacity-0 shadow-lg ring-1 ring-slate-700 transition-opacity group-hover:opacity-100">
        Back to top
      </span>
    </button>
  );
}
