import { AlertTriangle, Info, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'gold'
  title?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  const tones = {
    info: 'border-info/20 bg-info-soft text-info',
    warning: 'border-warning/25 bg-warning-soft text-warning',
    danger: 'border-destructive/25 bg-danger-soft text-destructive',
    gold: 'border-gold/30 bg-gold-soft text-accent-foreground',
  }
  const Icon = tone === 'info' ? Info : tone === 'gold' ? Sparkles : AlertTriangle
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border p-4 text-sm', tones[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title ? <div className="font-bold">{title}</div> : null}
        {children ? <div className="leading-relaxed opacity-90">{children}</div> : null}
      </div>
    </div>
  )
}
