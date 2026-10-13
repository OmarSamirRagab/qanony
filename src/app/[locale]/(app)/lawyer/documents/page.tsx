import { DocumentsPage } from '@/features/documents/components/documents-page'
import { requirePortal } from '@/lib/auth'

export default async function LawyerDocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requirePortal('lawyer')
  const { q } = await searchParams
  return <DocumentsPage portal="lawyer" userId={ctx.userId} q={q} />
}
