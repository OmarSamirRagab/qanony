import { DocumentsPage } from '@/features/documents/components/documents-page'
import { requirePortal } from '@/lib/auth'

export default async function ClientDocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requirePortal('client')
  const { q } = await searchParams
  return <DocumentsPage portal="client" userId={ctx.userId} q={q} />
}
