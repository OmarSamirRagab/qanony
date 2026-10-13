import { Heart } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, RatingStars } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/primitives'
import { Link } from '@/i18n/navigation'
import { requirePortal } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

export default async function FavoritesPage() {
  const ctx = await requirePortal('client')
  const t = await getTranslations('dashboard.favorites')
  const tl = await getTranslations('lawyers.card')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data } = await supabase
    .from('lawyer_favorites')
    .select('lawyer:lawyer_profiles(id, slug, display_name_ar, display_name_en, title_ar, title_en, photo_url, rating_avg, rating_count)')
    .eq('client_id', ctx.userId)
    .order('created_at', { ascending: false })
  const lawyers = (data ?? []).flatMap((r) => (r.lawyer ? [r.lawyer] : []))
  return (
    <>
      <PageHeader title={t('title')} />
      {lawyers.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lawyers.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-soft">
              <Avatar src={l.photo_url} name={pick(locale, l.display_name_ar, l.display_name_en)} className="size-12" />
              <div className="min-w-0 flex-1">
                <Link href={`/lawyers/${l.slug}`} className="block truncate font-bold hover:text-gold">
                  {pick(locale, l.display_name_ar, l.display_name_en)}
                </Link>
                <div className="truncate text-xs text-muted-foreground">{pick(locale, l.title_ar ?? '', l.title_en)}</div>
                {l.rating_count > 0 ? <RatingStars value={Number(l.rating_avg)} /> : null}
              </div>
              <Button asChild size="sm" variant="gold">
                <Link href={`/book/${l.slug}`}>{tl('book')}</Link>
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={Heart} title={t('empty')} action={<Button asChild><Link href="/lawyers">{tl('viewProfile')}</Link></Button>} />
      )}
    </>
  )
}
