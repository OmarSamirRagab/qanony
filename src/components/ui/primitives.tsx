'use client'
/**
 * Small Radix-based primitives grouped in one module: Label, Separator, Avatar,
 * Switch, Checkbox, Tooltip, Progress, Tabs, Accordion.
 */
import {
  Accordion as AccordionPrimitive,
  Avatar as AvatarPrimitive,
  Checkbox as CheckboxPrimitive,
  Label as LabelPrimitive,
  Progress as ProgressPrimitive,
  Separator as SeparatorPrimitive,
  Switch as SwitchPrimitive,
  Tabs as TabsPrimitive,
  Tooltip as TooltipPrimitive,
} from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import * as React from 'react'
import { cn, initials } from '@/lib/utils'

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('text-sm font-semibold leading-none text-foreground', className)} {...props} />
}

export function Separator({ className, orientation = 'horizontal', ...props }: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...props}
    />
  )
}

export function Avatar({ src, name, className }: { src?: string | null; name?: string | null; className?: string }) {
  return (
    <AvatarPrimitive.Root className={cn('relative flex size-10 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-card', className)}>
      {src ? <AvatarPrimitive.Image src={src} alt={name ?? ''} className="aspect-square size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center bg-primary/10 text-sm font-bold text-primary dark:bg-gold-soft dark:text-gold"
        delayMs={src ? 400 : 0}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input transition-colors data-[state=checked]:bg-gold disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-card shadow-sm transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0 rtl:data-[state=checked]:-translate-x-5" />
    </SwitchPrimitive.Root>
  )
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'peer size-5 shrink-0 cursor-pointer rounded-md border border-input bg-card data-[state=checked]:border-gold data-[state=checked]:bg-gold data-[state=checked]:text-gold-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export const TooltipProvider = TooltipPrimitive.Provider
export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground shadow-lift animate-fade-in">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <ProgressPrimitive.Root value={value} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <ProgressPrimitive.Indicator
        className="h-full bg-gold transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

export const Tabs = TabsPrimitive.Root
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex h-10 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground', className)} {...props} />
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  )
}
export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('mt-4 focus-visible:outline-none', className)} {...props} />
}

export const Accordion = AccordionPrimitive.Root
export function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item className={cn('border-b', className)} {...props} />
}
export function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn('flex flex-1 cursor-pointer items-center justify-between gap-3 py-4 text-start font-semibold transition-all hover:text-gold [&[data-state=open]>svg]:rotate-180', className)}
        {...props}
      >
        {children}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200" aria-hidden />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}
export function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content className="overflow-hidden text-sm text-muted-foreground" {...props}>
      <div className={cn('pb-4 leading-relaxed', className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}
