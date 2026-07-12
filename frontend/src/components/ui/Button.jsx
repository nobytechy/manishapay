import { cn } from '../../lib/utils';

/**
 * Multi-variant button. Variants: primary | ghost | danger.
 * Sizes: sm | md | lg.
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  ...rest
}) {
  const variants = {
    primary: 'bg-brand text-slate-950 hover:bg-brand-dark hover:text-white',
    ghost: 'border border-slate-700 text-slate-200 hover:bg-slate-800',
    danger: 'bg-danger text-white hover:bg-rose-600',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        loading ? 'cursor-wait opacity-90' : 'disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {loading && (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      )}
      <span className={loading ? 'opacity-90' : ''}>{children}</span>
    </button>
  );
}
