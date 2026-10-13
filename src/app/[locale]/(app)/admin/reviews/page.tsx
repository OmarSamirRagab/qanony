import { Star } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, RatingStars, Section, StatusBadge } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { Badge } from '@/components/ui/card'
import { FilterBar } from '@/features/admin/components/filter-bar'
import { QuickAction, ReasonAction } from '@/features/admin/components/reason-action'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { moderateReview } from '@/features/reviews/actions'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { Constants } from '@/types/database'

const PAGE = 20

export default async function AdminReviews({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const ctx = await adminAccess('reviews.moderate')
  if (!ctx) return <AccessDenied />
  const sp = await searchParams
  const t = await getTranslations('admin.reviews')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const page = Math.max(1, Number(sp.page) || 1)
  const statuses = Constants.public.Enums.review_status
  const supabase = await createClient()
  let query = supabase
    .from('reviews')
    .select('id, rating, comment, status, flagged_reasons, report_count, moderation_note, created_at, lawyer:lawyer_profiles(display_name_ar, display_name_en), reports:review_reports(reason, details, status)', {
      count: 'exact',
    })
    .order('report_count', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1)
  // Default queue: pending reviews and anything with reports.
  query = (statuses as readonly string[]).includes(sp.status ?? '') ? query.eq('status', sp.status as (typeof statuses)[number]) : query.or('status.eq.pending,report_count.gt.0')
  const { data, count } = await query
  return (
    <>
      <PageHeader title={t('title')} description={t('reported')} />
      <FilterBar basePath="/admin/reviews" selects={[{ name: 'status', label: tc('status'), value: sp.status, options: statuses.map((s) => ({ value: s, label: te(`review.${s}`) })) }]} />
      {data?.length ? (
        <div className="space-y-4">
          {data.map((r) => (
            <Section key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <RatingStars value={r.rating} />
                  <div className="mt-1 text-sm font-semibold">{(locale === 'en' && r.lawyer?.display_name_en) || r.lawyer?.display_name_ar}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(r.created_at, locale)}</div>
                </div>
                <StatusBadge status={r.status} label={te(`review.${r.status}`)} />
              </div>
              {r.comment ? <p className="mt-3 whitespace-pre-line text-sm">{r.comment}</p> : null}
              {r.flagged_reasons.length ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">{t('flags')}:</span>
                  {r.flagged_reasons.map((f) => (
                    <Badge key={f} variant="warning">
                      {f}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {r.reports?.length ? (
                <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs">
                  <div className="mb-1 font-semibold">
                    {t('reports')} ({r.report_count})
                  </div>
                  <ul className="space-y-1">
                    {r.reports.map((rep, i) => (
                      <li key={i}>
                        {te(`reportReason.${rep.reason as 'other'}`)}
                        {rep.details ? ` — ${rep.details}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {r.moderation_note ? <p className="mt-2 text-xs text-muted-foreground">{r.moderation_note}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {r.status !== 'published' ? <QuickAction label={t('publish')} action={moderateReview.bind(null, r.id, 'published', '')} success={tc('saved')} variant="gold" /> : null}
                {r.status !== 'hidden' ? (
                  <ReasonAction label={t('hide')} title={t('hide')} fieldLabel={tc('notes')} action={moderateReview.bind(null, r.id, 'hidden')} success={tc('saved')} />
                ) : null}
                {r.status !== 'rejected' ? (
                  <ReasonAction label={t('reject')} title={t('reject')} fieldLabel={tc('notes')} action={moderateReview.bind(null, r.id, 'rejected')} success={tc('saved')} variant="destructive" />
                ) : null}
              </div>
            </Section>
          ))}
        </div>
      ) : (
        <EmptyState icon={Star} title={tc('noData')} />
      )}
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/reviews" searchParams={sp} />
    </>
  )
}
