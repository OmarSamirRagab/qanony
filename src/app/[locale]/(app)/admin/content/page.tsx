import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, Section, StatusBadge } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Badge } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { ArticleDialog, CmsPageEditor, DeleteFaqButton, FaqDialog, type PageInitial } from '@/features/admin/components/content-editors'
import { Table, Td, Th, THead, Tr } from '@/features/admin/components/table'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { Link } from '@/i18n/navigation'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

const PAGE_SLUGS = ['privacy', 'terms', 'refund-policy', 'about'] as const

export default async function AdminContent() {
  const ctx = await adminAccess('content.manage')
  if (!ctx) return <AccessDenied />
  const t = await getTranslations('admin.content')
  const te = await getTranslations('enums.contentStatus')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const supabase = await createClient()
  const [{ data: articles }, { data: faqs }, { data: pages }, { data: categories }] = await Promise.all([
    supabase.from('legal_articles').select('*').order('updated_at', { ascending: false }),
    supabase.from('faqs').select('*').order('audience').order('sort_order'),
    supabase.from('cms_pages').select('*'),
    supabase.from('legal_categories').select('id, name_ar, name_en').order('sort_order'),
  ])
  const cats = (categories ?? []).map((c) => ({ id: c.id, name: pick(locale, c.name_ar, c.name_en) }))
  return (
    <>
      <PageHeader title={t('title')} />
      <Notice tone="warning" className="mb-6" title={t('contentWarning')} />
      <Tabs defaultValue="articles">
        <TabsList className="mb-4">
          <TabsTrigger value="articles">{t('articles')}</TabsTrigger>
          <TabsTrigger value="faqs">{t('faqs')}</TabsTrigger>
          <TabsTrigger value="pages">{t('pages')}</TabsTrigger>
        </TabsList>
        <TabsContent value="articles">
          <Section action={<ArticleDialog categories={cats} />}>
            <Table minWidth={720}>
              <THead>
                <Th>{tc('title')}</Th>
                <Th>{t('kind')}</Th>
                <Th>{tc('updatedAt')}</Th>
                <Th>{t('status')}</Th>
                <Th end />
              </THead>
              <tbody>
                {(articles ?? []).map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      {a.status === 'published' ? (
                        <Link href={`/articles/${a.slug}`} className="font-semibold hover:text-gold">
                          {pick(locale, a.title_ar, a.title_en)}
                        </Link>
                      ) : (
                        <span className="font-semibold">{pick(locale, a.title_ar, a.title_en)}</span>
                      )}
                      <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                        <span dir="ltr">{a.slug}</span>
                        {a.reviewed_by_lawyer ? <Badge variant="success">{t('reviewed')}</Badge> : null}
                      </div>
                    </Td>
                    <Td className="text-xs">{t(`kinds.${a.kind as 'article'}`)}</Td>
                    <Td className="text-xs text-muted-foreground">{formatDate(a.updated_at, locale)}</Td>
                    <Td>
                      <StatusBadge status={a.status} label={te(a.status)} />
                    </Td>
                    <Td end>
                      <ArticleDialog initial={a} categories={cats} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Section>
        </TabsContent>
        <TabsContent value="faqs">
          <Section action={<FaqDialog />}>
            <ul className="divide-y">
              {(faqs ?? []).map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{pick(locale, f.question_ar, f.question_en)}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <Badge variant="outline">{t(`audiences.${f.audience as 'general'}`)}</Badge>
                      {!f.is_published ? <Badge variant="muted">{te('draft')}</Badge> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <FaqDialog initial={f} />
                    <DeleteFaqButton id={f.id} />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </TabsContent>
        <TabsContent value="pages" className="space-y-6">
          <p className="text-sm text-muted-foreground">{t('pageSlugs')}</p>
          {PAGE_SLUGS.map((slug) => {
            const p = pages?.find((x) => x.slug === slug)
            const initial: PageInitial = { slug, title_ar: p?.title_ar ?? '', title_en: p?.title_en ?? null, body_ar: p?.body_ar ?? '', body_en: p?.body_en ?? null, status: p?.status ?? 'draft' }
            return (
              <Section key={slug} title={<span dir="ltr">/{slug}</span>} action={p ? <StatusBadge status={p.status} label={te(p.status)} /> : null}>
                <CmsPageEditor initial={initial} />
              </Section>
            )
          })}
        </TabsContent>
      </Tabs>
    </>
  )
}
