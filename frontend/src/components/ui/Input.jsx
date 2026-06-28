import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

const Input = forwardRef(function Input({ label, error, hint, className, id, type = 'text', ...rest }, ref) {
  const inputId = id || rest.name;
  const isPassword = type === 'password';
  const [show, setShow] = useState(false);
  const effectiveType = isPassword && show ? 'text' : type;

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          ref={ref}
          type={effectiveType}
          className={cn(
            'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500',
            'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30',
            isPassword && 'pr-10',
            error && 'border-danger focus:border-danger focus:ring-danger/30',
            className
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            tabIndex={-1}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
});

export default Input;
