import { BadgeCheck, CalendarClock, MapPin, Video } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { RatingStars } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/primitives'
import { Link } from '@/i18n/navigation'
import type { Governorate } from '@/features/reference/queries'
import type { LawyerSearchRow } from '@/features/lawyers/queries'
import { formatMoney } from '@/lib/domain/money'
import { formatDateTime } from '@/lib/format'
import { pick } from '@/lib/utils'

export async function LawyerCard({ lawyer, governorates }: { lawyer: LawyerSearchRow; governorates: Governorate[] }) {
  const t = await getTranslations('lawyers.card')
  const tc = await getTranslations('common')
  const te = await getTranslations('enums.consultation')
  const locale = await getLocale()
  const gov = governorates.find((g) => g.id === lawyer.governorate_id)
  const remote = lawyer.consultation_types.some((c) => c === 'video' || c === 'voice' || c === 'text')
  const name = pick(locale, lawyer.display_name_ar, lawyer.display_name_en)

  return (
    <article className="group flex flex-col rounded-2xl border bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex gap-4">
        <Avatar src={lawyer.photo_url} name={name} className="size-16 ring-gold/30" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-base font-bold">
              <Link href={`/lawyers/${lawyer.slug}`} className="hover:text-gold">
                {name}
              </Link>
            </h3>
            <BadgeCheck className="size-4.5 shrink-0 text-gold" aria-label={tc('verified')} />
            {lawyer.is_sponsored ? <Badge variant="outline" className="text-[10px]">{tc('sponsored')}</Badge> : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">{pick(locale, lawyer.title_ar ?? '', lawyer.title_en)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {lawyer.rating_count > 0 ? (
              <span className="flex items-center gap-1">
                <RatingStars value={Number(lawyer.rating_avg)} />
                <span className="font-semibold text-foreground">{Number(lawyer.rating_avg).toFixed(1)}</span>
                <span>({tc('reviewsCount', { count: lawyer.rating_count })})</span>
              </span>
            ) : null}
            <span>{t('experience', { years: lawyer.years_experience })}</span>
            {gov ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {pick(locale, gov.name_ar, gov.name_en)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 mb-4 flex flex-wrap gap-1.5">
        {lawyer.specializations.slice(0, 3).map((s) => (
          <Badge key={s.slug} variant="secondary">
            {pick(locale, s.name_ar, s.name_en)}
          </Badge>
        ))}
        {remote ? (
          <Badge variant="info">
            <Video aria-hidden /> {te('video')}
          </Badge>
        ) : null}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t pt-4">
        <div className="min-w-0 text-xs text-muted-foreground">
          <div>
            {t('from')}{' '}
            <span className="text-base font-bold text-foreground">
              {lawyer.min_price_minor == null ? '—' : lawyer.min_price_minor === 0 ? tc('free') : formatMoney(lawyer.min_price_minor, locale)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden />
            {lawyer.next_available_at ? t('nextAvailable', { when: formatDateTime(lawyer.next_available_at, locale) }) : t('noAvailability')}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <Link href={`/lawyers/${lawyer.slug}`}>{t('viewProfile')}</Link>
          </Button>
          <Button asChild variant="gold" size="sm">
            <Link href={`/book/${lawyer.slug}`}>{t('book')}</Link>
          </Button>
        </div>
      </div>
    </article>
  )
}
