import { cn } from '@/lib/utils'

/** Minimal responsive table primitives for admin listings (horizontal scroll on narrow screens). */
export function Table({ children, minWidth = 720, className }: { children: React.ReactNode; minWidth?: number; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm', className)} style={{ minWidth }}>
        {children}
      </table>
    </div>
  )
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="text-xs text-muted-foreground">
      <tr className="border-b">{children}</tr>
    </thead>
  )
}

export function Th({ children, end }: { children?: React.ReactNode; end?: boolean }) {
  return <th className={cn('px-2 py-2 font-semibold', end ? 'text-end' : 'text-start')}>{children}</th>
}

export function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="border-b align-top last:border-0">{children}</tr>
}

export function Td({ children, end, className }: { children?: React.ReactNode; end?: boolean; className?: string }) {
  return <td className={cn('px-2 py-2.5', end && 'text-end', className)}>{children}</td>
}
