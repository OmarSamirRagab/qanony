import { BadgeCheck, ChevronLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'

export async function VerifiedBadge({ className }: { className?: string }) {
  const t = await getTranslations('common')
  return (
    <Badge variant="gold" className={className}>
      <BadgeCheck aria-hidden /> {t('verified')}
    </Badge>
  )
}

export async function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  const t = await getTranslations('common')
  return (
    <nav aria-label={t('breadcrumbs')} className="mb-4 text-xs text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 ? <ChevronLeft className="size-3 ltr:rotate-180" aria-hidden /> : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-foreground hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-semibold text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
