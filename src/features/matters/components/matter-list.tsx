import { FolderKanban } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, StatusBadge } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getPathname, Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { formatDate } from '@/lib/format'
import { cn, pick } from '@/lib/utils'
import type { MatterListRow } from '../queries'

export async function MatterFilters({ basePath, status, q, extra = {} }: { basePath: string; status: string; q?: string; extra?: Record<string, string> }) {
  const t = await getTranslations('matters')
  const tc = await getTranslations('common')
  const locale = toLocale(await getLocale())
  const qs = (s: string) => new URLSearchParams({ ...extra, status: s, ...(q ? { q } : {}) }).toString()
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex h-10 items-center gap-1 rounded-lg bg-muted p-1">
        {(['open', 'closed', 'all'] as const).map((s) => (
          <Link key={s} href={`${basePath}?${qs(s)}`} className={cn('rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground', status === s && 'bg-card text-foreground shadow-sm')}>
            {s === 'all' ? tc('all') : t(s)}
          </Link>
        ))}
      </div>
      <form action={getPathname({ href: basePath, locale })} method="get" className="sm:w-72">
        {Object.entries(extra).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input type="hidden" name="status" value={status} />
        <Input name="q" defaultValue={q} placeholder={t('search')} aria-label={t('search')} />
      </form>
    </div>
  )
}

export async function MatterList({ rows, basePath, query = '', showClient = true }: { rows: MatterListRow[]; basePath: string; query?: string; showClient?: boolean }) {
  const t = await getTranslations('matters')
  const te = await getTranslations('enums')
  const locale = await getLocale()
  if (!rows.length) return <EmptyState icon={FolderKanban} title={t('empty')} />
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-start font-semibold">{t('reference')}</th>
            <th className="px-4 py-3 text-start font-semibold">{t('titleField')}</th>
            {showClient ? <th className="px-4 py-3 text-start font-semibold">{t('client')}</th> : <th className="px-4 py-3 text-start font-semibold">{t('lead')}</th>}
            <th className="px-4 py-3 text-start font-semibold">{t('priority')}</th>
            <th className="px-4 py-3 text-start font-semibold">{t('status')}</th>
            <th className="px-4 py-3 text-start font-semibold">{t('openedAt')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-t transition-colors hover:bg-muted/40">
              <td className="px-4 py-3 font-mono text-xs">
                <Link href={`${basePath}/${m.id}${query}`} className="hover:text-gold">
                  {m.reference}
                </Link>
              </td>
              <td className="px-4 py-3 font-semibold">
                <Link href={`${basePath}/${m.id}${query}`} className="hover:text-gold">
                  {m.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {showClient ? (m.client_record?.full_name ?? '—') : m.owner ? pick(locale, m.owner.display_name_ar, m.owner.display_name_en) : '—'}
              </td>
              <td className="px-4 py-3">
                <Badge variant={m.priority === 'urgent' ? 'danger' : m.priority === 'high' ? 'warning' : 'muted'}>{te(`priority.${m.priority}`)}</Badge>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={m.status} label={te(`matter.${m.status}`)} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(m.opened_at, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
