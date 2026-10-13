import { LifeBuoy } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, StatusBadge } from '@/components/shared'
import { NewTicketDialog } from '@/features/support/components/support-forms'
import { Link } from '@/i18n/navigation'
import { requireUser } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function SupportPage() {
  const ctx = await requireUser()
  const t = await getTranslations('dashboard.support')
  const te = await getTranslations('enums')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data } = await supabase.from('support_tickets').select('id, reference, subject, status, category, created_at').eq('requester_id', ctx.userId).order('created_at', { ascending: false })
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<NewTicketDialog basePath="/client/support" />} />
      {data?.length ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
          {data.map((tk) => (
            <li key={tk.id}>
              <Link href={`/client/support/${tk.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted/50">
                <span className="font-mono text-xs text-muted-foreground">{tk.reference}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{tk.subject}</span>
                <span className="text-xs text-muted-foreground">{te(`ticketCategory.${tk.category as 'other'}`)}</span>
                <span className="text-xs text-muted-foreground">{formatDate(tk.created_at, locale)}</span>
                <StatusBadge status={tk.status} label={te(`ticket.${tk.status}`)} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={LifeBuoy} title={t('empty')} />
      )}
    </>
  )
}
