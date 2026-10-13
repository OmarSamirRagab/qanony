import { Lock } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, StatusBadge } from '@/components/shared'
import { NoteComposer } from '@/components/shared/note-composer'
import { Breadcrumbs } from '@/components/shared/server'
import { Badge } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { replyTicket } from '../actions'
import { TicketStaffControls } from './ticket-staff-controls'

export async function TicketView({ id, userId, staff, backHref, backLabel }: { id: string; userId: string; staff: boolean; backHref: string; backLabel: string }) {
  const t = await getTranslations('dashboard.support')
  const te = await getTranslations('enums')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data: ticket } = await supabase.from('support_tickets').select('*, requester:profiles!support_tickets_requester_id_fkey(full_name)').eq('id', id).maybeSingle()
  if (!ticket) notFound()
  const { data: messages } = await supabase.from('support_ticket_messages').select('id, body, is_internal, created_at, author_id, author:profiles(full_name)').eq('ticket_id', id).order('created_at')

  async function submit(body: string, visibility: string) {
    'use server'
    return replyTicket(id, body, visibility === 'internal')
  }

  return (
    <>
      <Breadcrumbs items={[{ label: backLabel, href: backHref }, { label: ticket.reference }]} />
      <PageHeader
        title={ticket.subject}
        description={
          <span>
            <span className="font-mono">{ticket.reference}</span> · {te(`ticketCategory.${ticket.category as 'other'}`)} {staff ? `· ${ticket.requester?.full_name ?? ''}` : ''}
          </span>
        }
        actions={
          <>
            <StatusBadge status={ticket.status} label={te(`ticket.${ticket.status}`)} />
            {staff ? <TicketStaffControls id={id} status={ticket.status} /> : null}
          </>
        }
      />
      <ul className="mb-6 space-y-3">
        {(messages ?? []).map((m) => (
          <li key={m.id} className={cn('rounded-xl border p-4', m.author_id === userId ? 'bg-card' : 'bg-muted/50', m.is_internal && 'border-warning/40 bg-warning-soft/40')}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{m.author_id === ticket.requester_id ? m.author?.full_name : t('staff')}</span>
              <span className="flex items-center gap-2">
                {m.is_internal ? (
                  <Badge variant="warning">
                    <Lock aria-hidden /> {t('internal')}
                  </Badge>
                ) : null}
                {formatDateTime(m.created_at, locale)}
              </span>
            </div>
            <p className="whitespace-pre-line text-sm">{m.body}</p>
          </li>
        ))}
      </ul>
      {ticket.status !== 'closed' ? (
        <NoteComposer
          placeholder={t('replyPlaceholder')}
          submitLabel={t('reply')}
          visibilityOptions={staff ? [{ value: 'public', label: t('reply') }, { value: 'internal', label: t('internal') }] : undefined}
          onSubmit={submit}
          successMessage={t('reply')}
        />
      ) : null}
    </>
  )
}
