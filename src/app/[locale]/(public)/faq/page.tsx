import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/primitives'
import { getFaqs } from '@/features/content/queries'
import { Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { pick } from '@/lib/utils'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: 'content.faq' })
  return { title: t('metaTitle'), description: t('subtitle') }
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale)
  setRequestLocale(locale)
  const t = await getTranslations('content.faq')
  const faqs = await getFaqs()
  const groups = (['general', 'client', 'lawyer', 'firm'] as const).map((a) => ({ a, items: faqs.filter((f) => f.audience === a) })).filter((g) => g.items.length)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: pick(locale, f.question_ar, f.question_en), acceptedAnswer: { '@type': 'Answer', text: pick(locale, f.answer_ar, f.answer_en) } })),
  }
  return (
    <Container className="max-w-3xl py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.a}>
            <h2 className="mb-2 text-sm font-bold text-gold">{t(`audience.${g.a}`)}</h2>
            <Accordion type="multiple" className="rounded-2xl border bg-card px-5 shadow-soft">
              {g.items.map((f) => (
                <AccordionItem key={f.id} value={f.id} className="last:border-0">
                  <AccordionTrigger>{pick(locale, f.question_ar, f.question_en)}</AccordionTrigger>
                  <AccordionContent>{pick(locale, f.answer_ar, f.answer_en)}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}
      </div>
      <div className="mt-10 rounded-2xl border bg-muted/50 p-6 text-center">
        <div className="font-bold">{t('stillQuestions')}</div>
        <Button asChild className="mt-3">
          <Link href="/contact">{t('contactUs')}</Link>
        </Button>
      </div>
    </Container>
  )
}
