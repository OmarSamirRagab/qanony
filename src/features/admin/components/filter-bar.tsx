import { Search } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { AutoSubmitSelect } from '@/components/shared/auto-submit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getPathname } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'

export interface FilterSelect {
  name: string
  label: string
  value?: string
  options: { value: string; label: string }[]
}

/** GET filter form: optional free-text search plus auto-submitting selects. */
export async function FilterBar({
  basePath,
  query,
  queryPlaceholder,
  selects = [],
}: {
  basePath: string
  query?: string
  queryPlaceholder?: string
  selects?: FilterSelect[]
}) {
  const tc = await getTranslations('common')
  const locale = toLocale(await getLocale())
  return (
    <form action={getPathname({ href: basePath, locale })} method="get" role="search" className="mb-4 flex flex-wrap items-center gap-2">
      {queryPlaceholder ? (
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={query} placeholder={queryPlaceholder} aria-label={queryPlaceholder} className="ps-9" />
        </div>
      ) : null}
      {selects.map((s) => (
        <AutoSubmitSelect key={s.name} name={s.name} defaultValue={s.value ?? ''} aria-label={s.label} className="w-auto min-w-40">
          <option value="">
            {s.label}: {tc('all')}
          </option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </AutoSubmitSelect>
      ))}
      <Button type="submit" variant="outline">
        {tc('search')}
      </Button>
    </form>
  )
}
