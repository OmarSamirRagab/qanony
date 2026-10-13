import { ArrowLeft, BadgeCheck, CalendarCheck, CreditCard, FileLock2, MessagesSquare, Quote, Search, ShieldCheck, Star } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { toLocale } from '@/i18n/routing'
import { Container, EmptyState, RatingStars } from '@/components/shared'
import { NotConfiguredNotice } from '@/components/shared/notices'
import { Button } from '@/components/ui/button'
import { NativeSelect, Input } from '@/components/ui/input'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/primitives'
import { getArticles, getFaqs, getPublicFirms } from '@/features/content/queries'
import { LawyerCard } from '@/features/lawyers/components/lawyer-card'
import { getFeaturedLawyers, getSponsoredLawyers } from '@/features/lawyers/queries'
import { CategoryIcon } from '@/features/reference/category-icon'
import { getCategories, getConsultationTypes, getGovernorates } from '@/features/reference/queries'
import { getPathname, Link } from '@/i18n/navigation'
import { isSupabaseConfigured } from '@/lib/env'
import { formatDate } from '@/lib/format'
import { createPublicClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

export const revalidate = 300

async function getTestimonials() {
  if (!isSupabaseConfigured) return []
  const { data } = await createPublicClient()
    .from('reviews')
    .select('id, rating, comment, display_name, published_at, lawyer:lawyer_profiles(slug, display_name_ar, display_name_en)')
    .eq('status', 'published')
    .gte('rating', 4)
    .not('comment', 'is', null)
    .order('published_at', { ascending: false })
    .limit(3)
  return data ?? []
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(toLocale(locale))
  const t = await getTranslations('home')
  const te = await getTranslations('enums')
  const [categories, governorates, types, featured, sponsored, firms, articles, faqs, testimonials] = await Promise.all([
    getCategories(),
    getGovernorates(),
    getConsultationTypes(),
    getFeaturedLawyers(),
    getSponsoredLawyers(),
    getPublicFirms({ pageSize: 3 }),
    getArticles(3),
    getFaqs(),
    getTestimonials(),
  ])
  const lawyersPath = getPathname({ href: '/lawyers', locale: toLocale(locale) })
  const popular = categories.slice(0, 5)

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy text-navy-foreground">
        <div className="bg-pattern absolute inset-0 opacity-90" aria-hidden />
        <Container className="relative grid gap-10 py-14 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:py-20">
          <div className="animate-rise">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
              <BadgeCheck className="size-3.5" aria-hidden /> {t('hero.eyebrow')}
            </p>
            <h1 className="font-display text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-[3.4rem]">
              {t('hero.title')} <span className="text-gold">{t('hero.titleAccent')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">{t('hero.subtitle')}</p>
            <ul className="mt-7 grid gap-2.5 text-sm text-white/80 sm:grid-cols-1">
              {[
                [ShieldCheck, t('hero.stat1')],
                [CreditCard, t('hero.stat2')],
                [FileLock2, t('hero.stat3')],
              ].map(([Icon, text], i) => {
                const I = Icon as typeof ShieldCheck
                return (
                  <li key={i} className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-full bg-gold/15 text-gold">
                      <I className="size-4" aria-hidden />
                    </span>
                    {text as string}
                  </li>
                )
              })}
            </ul>
          </div>

          <form action={lawyersPath} method="get" className="animate-rise rounded-2xl border border-white/10 bg-card p-5 text-card-foreground shadow-lift sm:p-6" role="search">
            <h2 className="mb-4 text-lg font-bold">{t('hero.searchLabel')}</h2>
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input name="q" placeholder={t('hero.searchPlaceholder')} className="h-12 ps-9" aria-label={t('hero.searchPlaceholder')} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <NativeSelect name="category" aria-label={t('hero.specialization')} className="h-12" defaultValue="">
                  <option value="">{t('hero.anySpecialization')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {pick(locale, c.name_ar, c.name_en)}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect name="governorate" aria-label={t('hero.governorate')} className="h-12" defaultValue="">
                  <option value="">{t('hero.anyGovernorate')}</option>
                  {governorates.map((g) => (
                    <option key={g.id} value={g.id}>
                      {pick(locale, g.name_ar, g.name_en)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <NativeSelect name="type" aria-label={t('hero.consultationType')} className="h-12" defaultValue="">
                <option value="">{t('hero.anyType')}</option>
                {types.map((ct) => (
                  <option key={ct.code} value={ct.code}>
                    {te(`consultation.${ct.code}`)}
                  </option>
                ))}
              </NativeSelect>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="online" value="1" className="size-4 accent-[var(--color-gold)]" /> {t('hero.onlineOnly')}
              </label>
              <Button type="submit" variant="gold" size="lg" className="w-full">
                <Search aria-hidden /> {t('hero.search')}
              </Button>
            </div>
            {popular.length ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{t('hero.popular')}</span>
                {popular.map((c) => (
                  <Link key={c.id} href={`/lawyers?category=${c.slug}`} className="rounded-full bg-muted px-2.5 py-1 font-semibold text-foreground hover:bg-gold-soft">
                    {pick(locale, c.name_ar, c.name_en)}
                  </Link>
                ))}
              </div>
            ) : null}
          </form>
        </Container>
      </section>

      {!isSupabaseConfigured ? (
        <Container className="pt-8">
          <NotConfiguredNotice />
        </Container>
      ) : null}

      {/* Categories */}
      <section className="py-16">
        <Container>
          <SectionHeading title={t('categories.title')} subtitle={t('categories.subtitle')} href="/categories" cta={t('categories.viewAll')} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.slice(0, 12).map((c) => (
              <Link
                key={c.id}
                href={`/categories/${c.slug}`}
                className="group flex flex-col items-center gap-3 rounded-2xl border bg-card p-4 text-center shadow-soft transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-lift"
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-primary/8 text-primary transition-colors group-hover:bg-gold-soft group-hover:text-gold dark:bg-secondary dark:text-gold">
                  <CategoryIcon name={c.icon} className="size-6" />
                </span>
                <span className="text-sm font-bold">{pick(locale, c.name_ar, c.name_en)}</span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Featured lawyers */}
      <section className="bg-muted/50 py-16">
        <Container>
          <SectionHeading title={t('featured.title')} subtitle={t('featured.subtitle')} href="/lawyers" cta={t('featured.viewAll')} />
          {sponsored.length ? (
            <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border px-2 py-0.5 font-semibold">{t('featured.sponsored')}</span>
              {sponsored.map((s) => (
                <Link key={s.id} href={`/lawyers/${s.slug}`} className="font-semibold text-foreground hover:text-gold">
                  {pick(locale, s.display_name_ar, s.display_name_en)}
                </Link>
              ))}
            </div>
          ) : null}
          {featured.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {featured.slice(0, 6).map((l) => (
                <LawyerCard key={l.id} lawyer={l} governorates={governorates} />
              ))}
            </div>
          ) : (
            <EmptyState icon={BadgeCheck} title={t('featured.empty')} />
          )}
        </Container>
      </section>

      {/* How it works */}
      <section className="py-16">
        <Container>
          <SectionHeading title={t('how.title')} subtitle={t('how.subtitle')} />
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [Search, 'step1'],
              [CalendarCheck, 'step2'],
              [CreditCard, 'step3'],
              [MessagesSquare, 'step4'],
            ].map(([Icon, key], i) => {
              const I = Icon as typeof Search
              const k = key as 'step1' | 'step2' | 'step3' | 'step4'
              return (
                <li key={k} className="relative rounded-2xl border bg-card p-6 shadow-soft">
                  <span className="absolute end-5 top-5 font-display text-4xl font-bold text-gold/25">{i + 1}</span>
                  <span className="flex size-11 items-center justify-center rounded-xl bg-navy text-gold">
                    <I className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-bold">{t(`how.${k}Title`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(`how.${k}Body`)}</p>
                </li>
              )
            })}
          </ol>
        </Container>
      </section>

      {/* Trust */}
      <section className="bg-navy py-16 text-navy-foreground">
        <Container>
          <div className="mb-10 max-w-2xl">
            <h2 className="font-display text-3xl font-bold text-white">{t('trust.title')}</h2>
            <p className="mt-2 text-white/70">{t('trust.subtitle')}</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [BadgeCheck, 'verification'],
              [FileLock2, 'privacy'],
              [CreditCard, 'payment'],
              [Star, 'reviews'],
            ].map(([Icon, key]) => {
              const I = Icon as typeof Search
              const k = key as 'verification' | 'privacy' | 'payment' | 'reviews'
              return (
                <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <I className="size-7 text-gold" aria-hidden />
                  <h3 className="mt-4 font-bold text-white">{t(`trust.${k}Title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">{t(`trust.${k}Body`)}</p>
                </div>
              )
            })}
          </div>
        </Container>
      </section>

      {/* Testimonials — real, published, verified reviews only */}
      <section className="py-16">
        <Container>
          <SectionHeading title={t('testimonials.title')} subtitle={t('testimonials.subtitle')} />
          {testimonials.length ? (
            <div className="grid gap-5 md:grid-cols-3">
              {testimonials.map((r) => (
                <figure key={r.id} className="flex flex-col rounded-2xl border bg-card p-6 shadow-soft">
                  <Quote className="size-6 text-gold/50" aria-hidden />
                  <blockquote className="mt-3 flex-1 text-sm leading-relaxed">{r.comment}</blockquote>
                  <figcaption className="mt-4 flex items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
                    <span>
                      <span className="font-bold text-foreground">{r.display_name ?? t('testimonials.verifiedClient')}</span>
                      {r.lawyer ? (
                        <>
                          {' · '}
                          <Link href={`/lawyers/${r.lawyer.slug}`} className="hover:text-gold">
                            {pick(locale, r.lawyer.display_name_ar, r.lawyer.display_name_en)}
                          </Link>
                        </>
                      ) : null}
                    </span>
                    <RatingStars value={r.rating} />
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <EmptyState icon={Quote} title={t('testimonials.empty')} />
          )}
        </Container>
      </section>

      {/* Firms */}
      {firms.rows.length ? (
        <section className="bg-muted/50 py-16">
          <Container>
            <SectionHeading title={t('firms.title')} subtitle={t('firms.subtitle')} href="/firms" cta={t('firms.viewAll')} />
            <div className="grid gap-5 md:grid-cols-3">
              {firms.rows.map((f) => (
                <Link key={f.id} href={`/firms/${f.slug}`} className="rounded-2xl border bg-card p-6 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift">
                  <h3 className="font-bold">{pick(locale, f.name_ar, f.name_en)}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{pick(locale, f.description_ar ?? '', f.description_en)}</p>
                </Link>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      {/* Articles */}
      {articles.length ? (
        <section className="py-16">
          <Container>
            <SectionHeading title={t('articles.title')} subtitle={t('articles.subtitle')} href="/articles" cta={t('articles.viewAll')} />
            <div className="grid gap-5 md:grid-cols-3">
              {articles.map((a) => (
                <Link key={a.id} href={`/articles/${a.slug}`} className="group flex flex-col rounded-2xl border bg-card p-6 shadow-soft transition-all hover:shadow-lift">
                  <span className="text-xs font-semibold text-gold">{formatDate(a.published_at, locale)}</span>
                  <h3 className="mt-2 font-bold leading-snug group-hover:text-gold">{pick(locale, a.title_ar, a.title_en)}</h3>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">{pick(locale, a.excerpt_ar ?? '', a.excerpt_en)}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-gold">
                    {t('articles.readMore')} <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      {/* FAQ */}
      {faqs.length ? (
        <section className="bg-muted/50 py-16">
          <Container className="max-w-3xl">
            <SectionHeading title={t('faq.title')} href="/faq" cta={t('faq.viewAll')} />
            <Accordion type="single" collapsible className="rounded-2xl border bg-card px-5 shadow-soft">
              {faqs.slice(0, 5).map((f) => (
                <AccordionItem key={f.id} value={f.id} className="last:border-0">
                  <AccordionTrigger>{pick(locale, f.question_ar, f.question_en)}</AccordionTrigger>
                  <AccordionContent>{pick(locale, f.answer_ar, f.answer_en)}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Container>
        </section>
      ) : null}

      {/* CTA */}
      <section className="py-16">
        <Container className="grid gap-5 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-3xl bg-navy p-8 text-navy-foreground sm:p-10">
            <div className="bg-pattern absolute inset-0" aria-hidden />
            <div className="relative">
              <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">{t('cta.title')}</h2>
              <p className="mt-3 max-w-md text-white/70">{t('cta.subtitle')}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild variant="gold" size="lg">
                  <Link href="/register/lawyer">{t('cta.lawyer')}</Link>
                </Button>
                <Button asChild variant="onDark" size="lg">
                  <Link href="/register/lawyer?firm=1">{t('cta.firm')}</Link>
                </Button>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border bg-gold-soft p-8 sm:p-10">
            <h2 className="font-display text-2xl font-bold text-primary sm:text-3xl dark:text-gold">{t('cta.clientTitle')}</h2>
            <p className="mt-3 max-w-md text-muted-foreground">{t('cta.clientSubtitle')}</p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/lawyers">{t('cta.client')}</Link>
            </Button>
          </div>
        </Container>
      </section>
    </>
  )
}

function SectionHeading({ title, subtitle, href, cta }: { title: string; subtitle?: string; href?: string; cta?: string }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="font-display text-3xl font-bold text-primary dark:text-foreground">{title}</h2>
        {subtitle ? <p className="mt-2 max-w-2xl text-muted-foreground">{subtitle}</p> : null}
      </div>
      {href && cta ? (
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-bold text-gold hover:underline">
          {cta} <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden />
        </Link>
      ) : null}
    </div>
  )
}
