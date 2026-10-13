import { Skeleton } from '@/components/ui/card'

/** Generic dashboard loading state: header, stat row and a list. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  )
}
