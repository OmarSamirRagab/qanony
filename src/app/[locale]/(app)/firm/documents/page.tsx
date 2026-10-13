import { getTranslations } from 'next-intl/server'
import { PageHeader, Section } from '@/components/shared'
import { DocumentList } from '@/features/documents/components/document-list'
import { DocumentUploader } from '@/features/documents/components/document-uploader'
import { FirmDenied } from '@/features/firms/components/denied'
import { getFirmContext } from '@/features/firms/context'
import { createClient } from '@/lib/supabase/server'

export default async function FirmDocumentsPage() {
  const { ctx, firm, can } = await getFirmContext()
  if (!can('documents.view')) return <FirmDenied />
  const t = await getTranslations('dashboard.documents')
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('id, title, category, size_bytes, scan_status, created_at, current_version, owner_id, ai_processing_allowed')
    .eq('firm_id', firm.firm_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(300)
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={can('documents.upload') ? <DocumentUploader target={{ firmId: firm.firm_id }} variant="gold" defaultCategory="other" /> : null} />
      <Section>
        <DocumentList documents={data ?? []} currentUserId={ctx.userId} />
      </Section>
    </>
  )
}
