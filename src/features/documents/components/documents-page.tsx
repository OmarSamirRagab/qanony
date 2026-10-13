import { getTranslations } from 'next-intl/server'
import { PageHeader, Section } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { getPathname } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { createClient } from '@/lib/supabase/server'
import { getLocale } from 'next-intl/server'
import { DocumentList } from './document-list'
import { DocumentUploader } from './document-uploader'

/** "My documents" + "Shared with me" for client and lawyer portals. */
export async function DocumentsPage({ portal, userId, q }: { portal: 'client' | 'lawyer'; userId: string; q?: string }) {
  const t = await getTranslations('dashboard.documents')
  const locale = toLocale(await getLocale())
  const supabase = await createClient()
  const search = (q ?? '').replace(/[%,()]/g, '').slice(0, 80)
  let mine = supabase.from('documents').select('id, title, category, size_bytes, scan_status, created_at, current_version, owner_id, ai_processing_allowed').eq('owner_id', userId).eq('status', 'active')
  let shared = supabase.from('documents').select('id, title, category, size_bytes, scan_status, created_at, current_version, owner_id, ai_processing_allowed').neq('owner_id', userId).eq('status', 'active')
  if (search) {
    mine = mine.ilike('title', `%${search}%`)
    shared = shared.ilike('title', `%${search}%`)
  }
  const [{ data: own }, { data: others }] = await Promise.all([mine.order('created_at', { ascending: false }).limit(200), shared.order('created_at', { ascending: false }).limit(200)])
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<DocumentUploader target={{}} variant="gold" defaultCategory="other" />} />
      <form action={getPathname({ href: `/${portal}/documents`, locale })} className="mb-5 max-w-sm" role="search">
        <Input name="q" defaultValue={q} placeholder={t('search')} aria-label={t('search')} />
      </form>
      <div className="space-y-6">
        <Section title={t('mine')}>
          <DocumentList documents={own ?? []} currentUserId={userId} />
        </Section>
        <Section title={t('sharedWithMe')}>
          <DocumentList documents={others ?? []} currentUserId={userId} />
        </Section>
      </div>
    </>
  )
}
