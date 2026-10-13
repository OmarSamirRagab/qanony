'use client'
/** Overlay primitives: Dialog, Sheet (side drawer), DropdownMenu, Popover. */
import { Dialog as DialogPrimitive, DropdownMenu as DropdownPrimitive, Popover as PopoverPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  title,
  description,
  closeLabel = 'Close',
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: React.ReactNode; description?: React.ReactNode; closeLabel?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy/50 backdrop-blur-[2px] animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed start-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-y-1/2 overflow-y-auto rounded-2xl border bg-card p-6 shadow-lift animate-rise ltr:-translate-x-1/2 rtl:translate-x-1/2',
          className,
        )}
        {...props}
      >
        <div className="mb-4 pe-8">
          <DialogPrimitive.Title className="text-lg font-bold">{title}</DialogPrimitive.Title>
          {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
        </div>
        {children}
        <DialogPrimitive.Close className="absolute end-4 top-4 cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={closeLabel}>
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
}

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close
export function SheetContent({ className, children, title, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy/50 animate-fade-in" />
      <DialogPrimitive.Content
        className={cn('fixed inset-y-0 start-0 z-50 flex w-80 max-w-[85vw] flex-col overflow-y-auto bg-sidebar text-sidebar-foreground shadow-lift animate-fade-in', className)}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export const DropdownMenu = DropdownPrimitive.Root
export const DropdownMenuTrigger = DropdownPrimitive.Trigger
export function DropdownMenuContent({ className, align = 'end', ...props }: React.ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-48 overflow-hidden rounded-xl border bg-card p-1 text-card-foreground shadow-lift animate-fade-in', className)}
        {...props}
      />
    </DropdownPrimitive.Portal>
  )
}
export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none transition-colors focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownPrimitive.Label>) {
  return <DropdownPrimitive.Label className={cn('px-2.5 py-1.5 text-xs font-semibold text-muted-foreground', className)} {...props} />
}
export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownPrimitive.Separator>) {
  return <DropdownPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export function PopoverContent({ className, align = 'end', ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={8}
        className={cn('z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-0 text-card-foreground shadow-lift animate-fade-in', className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}
