import { Star } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, RatingStars, StatusBadge } from '@/components/shared'
import { Link } from '@/i18n/navigation'
import { requirePortal } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

export default async function ClientReviewsPage() {
  const ctx = await requirePortal('client')
  const t = await getTranslations('dashboard.reviews')
  const te = await getTranslations('enums.review')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data } = await supabase
    .from('reviews')
    .select('id, rating, comment, status, created_at, lawyer_response, lawyer:lawyer_profiles(slug, display_name_ar, display_name_en)')
    .eq('client_id', ctx.userId)
    .order('created_at', { ascending: false })
  return (
    <>
      <PageHeader title={t('title')} description={t('clientSubtitle')} />
      {data?.length ? (
        <ul className="space-y-3">
          {data.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RatingStars value={r.rating} />
                  {r.lawyer ? (
                    <Link href={`/lawyers/${r.lawyer.slug}`} className="font-semibold hover:text-gold">
                      {pick(locale, r.lawyer.display_name_ar, r.lawyer.display_name_en)}
                    </Link>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {formatDate(r.created_at, locale)} <StatusBadge status={r.status} label={te(r.status)} />
                </div>
              </div>
              {r.comment ? <p className="mt-2 text-sm">{r.comment}</p> : null}
              {r.lawyer_response ? <p className="mt-2 rounded-lg border-s-2 border-gold bg-muted/60 p-2 text-sm">{r.lawyer_response}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Star} title={t('empty')} />
      )}
    </>
  )
}
