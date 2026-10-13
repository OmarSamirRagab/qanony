'use client'
import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** A panel that is always visible on large screens and toggleable on small ones (single DOM copy). */
export function CollapsiblePanel({ label, defaultOpen = false, children, className }: { label: string; defaultOpen?: boolean; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={className}>
      <Button type="button" variant="outline" className="mb-4 w-full lg:hidden" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal aria-hidden /> {label}
      </Button>
      <div className={cn(open ? 'block' : 'hidden', 'lg:block')}>{children}</div>
    </div>
  )
}
