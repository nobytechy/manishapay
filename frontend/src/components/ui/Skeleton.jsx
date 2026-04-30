import { cn } from '../../lib/utils';

export default function Skeleton({ className }) {
  return <div className={cn('skeleton h-4 w-full', className)} />;
}

export function SkeletonRow({ cols = 4 }) {
  return (
    <div className="flex gap-3 py-2">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  );
}
