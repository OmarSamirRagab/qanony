import { Download, FileText, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { formatBytes } from '@/lib/files'
import { formatDate } from '@/lib/format'
import type { Enums } from '@/types/database'
import { DocumentRowActions } from './document-row-actions'

export interface DocumentRow {
  id: string
  title: string
  category: Enums<'document_category'>
  size_bytes: number | null
  scan_status: Enums<'scan_status'>
  created_at: string
  current_version: number
  owner_id: string
  shared_with_client?: boolean
  ai_processing_allowed?: boolean
}

export async function DocumentList({
  documents,
  currentUserId,
  matterId,
  canShareWithClient = false,
  emptyLabel,
}: {
  documents: DocumentRow[]
  currentUserId: string
  matterId?: string
  canShareWithClient?: boolean
  emptyLabel?: string
}) {
  const t = await getTranslations('dashboard.documents')
  const te = await getTranslations('enums')
  const tm = await getTranslations('matters.documents')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  if (!documents.length) return <EmptyState icon={FileText} title={emptyLabel ?? t('empty')} className="py-8" />
  return (
    <ul className="divide-y rounded-xl border">
      {documents.map((d) => {
        const ScanIcon = d.scan_status === 'clean' ? ShieldCheck : d.scan_status === 'infected' ? ShieldAlert : ShieldQuestion
        return (
          <li key={d.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold">
                <FileText className="size-4.5" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{d.title}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{te(`documentCategory.${d.category}`)}</span>
                  {d.size_bytes ? <span>{formatBytes(d.size_bytes, locale)}</span> : null}
                  <span>{formatDate(d.created_at, locale)}</span>
                  {d.current_version > 1 ? <span>v{d.current_version}</span> : null}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={d.scan_status === 'clean' ? 'success' : d.scan_status === 'infected' ? 'danger' : 'muted'} title={d.scan_status === 'unscanned' ? t('unscannedHint') : undefined}>
                <ScanIcon aria-hidden /> {te(`scan.${d.scan_status}`)}
              </Badge>
              {matterId ? <Badge variant={d.shared_with_client ? 'info' : 'outline'}>{d.shared_with_client ? tm('sharedWithClient') : tm('notShared')}</Badge> : null}
              {d.scan_status !== 'infected' ? (
                <a href={`/api/documents/${d.id}/download`} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-semibold hover:bg-muted" rel="noopener">
                  <Download className="size-3.5" aria-hidden /> {tc('download')}
                </a>
              ) : null}
              <DocumentRowActions documentId={d.id} isOwner={d.owner_id === currentUserId} matterId={matterId} shared={d.shared_with_client} canShareWithClient={canShareWithClient} aiAllowed={d.ai_processing_allowed} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
