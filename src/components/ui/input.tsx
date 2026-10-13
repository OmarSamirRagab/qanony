import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export const inputClass =
  'flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:outline-2 focus-visible:outline-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive file:border-0 file:bg-transparent file:text-sm file:font-medium'

export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return <input type={type} className={cn(inputClass, className)} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(inputClass, 'h-auto min-h-24 resize-y leading-relaxed', className)} {...props} />
}

/** Native select: accessible, mobile-friendly and works without JavaScript. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select className={cn(inputClass, 'appearance-none pe-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  )
}
