import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/** Server-rendered pagination that preserves the current query string. */
export async function Pagination({
  page,
  pageSize,
  total,
  basePath,
  searchParams,
}: {
  page: number
  pageSize: number
  total: number
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const t = await getTranslations('common')
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const href = (p: number) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === 'page' || v == null) continue
      for (const item of Array.isArray(v) ? v : [v]) qs.append(k, item)
    }
    if (p > 1) qs.set('page', String(p))
    const s = qs.toString()
    return s ? `${basePath}?${s}` : basePath
  }
  const linkClass = 'inline-flex h-9 items-center gap-1 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-muted'
  return (
    <nav className="mt-6 flex items-center justify-between gap-3" aria-label="pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass} rel="prev">
          <ChevronRight className="size-4 ltr:rotate-180" aria-hidden /> {t('previous')}
        </Link>
      ) : (
        <span className={cn(linkClass, 'pointer-events-none opacity-40')}>{t('previous')}</span>
      )}
      <span className="text-sm text-muted-foreground">{t('page', { page, total: pages })}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className={linkClass} rel="next">
          {t('next')} <ChevronLeft className="size-4 ltr:rotate-180" aria-hidden />
        </Link>
      ) : (
        <span className={cn(linkClass, 'pointer-events-none opacity-40')}>{t('next')}</span>
      )}
    </nav>
  )
}
