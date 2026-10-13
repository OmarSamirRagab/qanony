import { Inbox, Star, type LucideIcon } from 'lucide-react'
import { Badge, type BadgeVariant } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)} {...props} />
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-bold tracking-wide text-gold uppercase">{eyebrow}</div> : null}
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[1.7rem]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center', className)}>
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-gold-soft text-gold">
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="font-bold">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = 'default',
  href,
}: {
  label: React.ReactNode
  value: React.ReactNode
  icon?: LucideIcon
  hint?: React.ReactNode
  tone?: 'default' | 'gold' | 'success' | 'warning' | 'info'
  href?: string
}) {
  const tones = {
    default: 'bg-primary/8 text-primary dark:bg-secondary dark:text-foreground',
    gold: 'bg-gold-soft text-gold',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    info: 'bg-info-soft text-info',
  }
  const body = (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-lift">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-muted-foreground">{label}</div>
        <div className="mt-1.5 text-2xl font-bold tabular-nums">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      {Icon ? (
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="size-5" aria-hidden />
        </div>
      ) : null}
    </div>
  )
  return href ? (
    <Link href={href} className="block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  )
}

const STATUS_TONES: Record<string, BadgeVariant> = {
  CONFIRMED: 'success',
  COMPLETED: 'success',
  PAID: 'success',
  ACTIVE: 'success',
  DELIVERED: 'info',
  IN_PROGRESS: 'info',
  UNDER_REVIEW: 'info',
  NEW: 'info',
  PENDING_PAYMENT: 'warning',
  PENDING_CONFIRMATION: 'warning',
  WAITING_FOR_CLIENT: 'warning',
  WAITING_FOR_EXTERNAL_PARTY: 'warning',
  REVISION_REQUESTED: 'warning',
  ON_HOLD: 'warning',
  DISPUTED: 'danger',
  NO_SHOW: 'danger',
  CANCELLED: 'muted',
  EXPIRED: 'muted',
  REFUNDED: 'muted',
  CLOSED: 'muted',
  ARCHIVED: 'muted',
  CREATED: 'muted',
  succeeded: 'success',
  active: 'success',
  verified: 'success',
  published: 'success',
  paid: 'success',
  clean: 'success',
  resolved: 'success',
  done: 'success',
  trialing: 'info',
  processing: 'info',
  approved: 'info',
  in_progress: 'info',
  pending: 'warning',
  pending_review: 'warning',
  requested: 'warning',
  initiated: 'warning',
  invited: 'warning',
  open: 'warning',
  past_due: 'warning',
  incomplete: 'warning',
  todo: 'warning',
  issued: 'info',
  failed: 'danger',
  rejected: 'danger',
  suspended: 'danger',
  infected: 'danger',
  blocked: 'danger',
  urgent: 'danger',
  high: 'warning',
  refunded: 'muted',
  partially_refunded: 'muted',
  cancelled: 'muted',
  expired: 'muted',
  draft: 'muted',
  archived: 'muted',
  unverified: 'muted',
  removed: 'muted',
  void: 'muted',
}

export function StatusBadge({ status, label, className }: { status: string; label: React.ReactNode; className?: string }) {
  return (
    <Badge variant={STATUS_TONES[status] ?? 'secondary'} className={className}>
      {label}
    </Badge>
  )
}

export function RatingStars({ value, size = 'sm', className }: { value: number; size?: 'sm' | 'md'; className?: string }) {
  const px = size === 'sm' ? 'size-3.5' : 'size-5'
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value.toFixed(1)} / 5`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(px, i <= Math.round(value) ? 'fill-gold text-gold' : 'fill-muted text-muted-foreground/30')} aria-hidden />
      ))}
    </span>
  )
}

export function Section({ title, description, action, children, className }: { title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-soft', className)}>
      {title || action ? (
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            {title ? <h2 className="text-base font-bold">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function DescriptionList({ items, className }: { items: { label: React.ReactNode; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {items.map((item, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-semibold text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 break-words text-sm">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
