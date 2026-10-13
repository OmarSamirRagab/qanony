import { Download } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getPathname } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'

/** GET date-range filter (works without JS) with an optional CSV export link. */
export async function DateRangeFilter({ basePath, from, to, extra = {}, csvHref }: { basePath: string; from: string; to: string; extra?: Record<string, string>; csvHref?: string }) {
  const t = await getTranslations('common')
  const locale = toLocale(await getLocale())
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <form action={getPathname({ href: basePath, locale })} className="flex flex-wrap items-end gap-2">
        {Object.entries(extra).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="text-xs font-semibold text-muted-foreground">
          {t('from')}
          <Input type="date" name="from" defaultValue={from} className="mt-1 h-9 w-40" />
        </label>
        <label className="text-xs font-semibold text-muted-foreground">
          {t('to')}
          <Input type="date" name="to" defaultValue={to} className="mt-1 h-9 w-40" />
        </label>
        <Button type="submit" size="sm" className="h-9">
          {t('apply')}
        </Button>
      </form>
      {csvHref ? (
        <Button asChild variant="outline" size="sm" className="h-9">
          <a href={csvHref}>
            <Download aria-hidden /> {t('exportCsv')}
          </a>
        </Button>
      ) : null}
    </div>
  )
}

export function parseRange(sp: { from?: string; to?: string }, defaultDays = 30): { from: string; to: string } {
  const iso = /^\d{4}-\d{2}-\d{2}$/
  const today = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.now() - defaultDays * 86_400_000).toISOString().slice(0, 10)
  return { from: sp.from && iso.test(sp.from) ? sp.from : start, to: sp.to && iso.test(sp.to) ? sp.to : today }
}
