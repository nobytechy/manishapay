import { useState } from 'react';

/**
 * Lightweight tooltip — pure CSS would work but we want it positioned
 * sensibly without overflow clipping. Hover and focus reveal.
 */
export default function Tooltip({ label, children, side = 'top' }) {
  const [open, setOpen] = useState(false);

  const sideClass = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[side];

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-30 whitespace-nowrap rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 shadow-lg ${sideClass}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
