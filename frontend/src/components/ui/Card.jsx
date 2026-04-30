import { cn } from '../../lib/utils';

export default function Card({ title, description, action, children, className }) {
  return (
    <section className={cn('rounded-xl border border-slate-800 bg-slate-900/60 shadow-card', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-100">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
