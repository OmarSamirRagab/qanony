import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { DescriptionList, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { NoteComposer } from '@/components/shared/note-composer'
import { DocumentList } from '@/features/documents/components/document-list'
import { Link } from '@/i18n/navigation'
import { formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { postDisputeMessage } from '../actions'
import { ResolveDisputeForm } from './resolve-form'

export async function DisputeView({ id, userId, admin }: { id: string; userId: string; admin: boolean }) {
  const t = await getTranslations('dashboard.disputes')
  const te = await getTranslations('enums')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data: d } = await supabase
    .from('disputes')
    .select('*, raiser:profiles!disputes_raised_by_fkey(full_name), against:profiles!disputes_against_user_id_fkey(full_name), appointment:appointments(reference), order:service_orders(reference)')
    .eq('id', id)
    .maybeSingle()
  if (!d) notFound()
  const [{ data: messages }, { data: evidence }] = await Promise.all([
    supabase.from('dispute_messages').select('id, body, created_at, author_id, author:profiles(full_name)').eq('dispute_id', id).order('created_at'),
    supabase.from('dispute_evidence').select('document:documents(id, title, category, size_bytes, scan_status, created_at, current_version, owner_id)').eq('dispute_id', id),
  ])
  const docs = (evidence ?? []).flatMap((e) => (e.document ? [e.document] : []))
  const open = !['resolved', 'rejected', 'closed'].includes(d.status)
  async function submit(body: string) {
    'use server'
    return postDisputeMessage(id, body)
  }
  return (
    <>
      <PageHeader title={`${t('title')} ${d.reference}`} description={d.appointment?.reference ?? d.order?.reference} actions={<StatusBadge status={d.status} label={te(`dispute.${d.status}`)} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Section>
            <DescriptionList
              items={[
                { label: t('raisedBy'), value: d.raiser?.full_name },
                { label: t('against'), value: d.against?.full_name },
                { label: t('reason'), value: te(`disputeReason.${d.reason as 'other'}`) },
                {
                  label: te('appointment.DISPUTED'),
                  value: d.appointment_id ? (
                    <Link href={admin ? `/admin/appointments?q=${d.appointment?.reference}` : '#'} className="font-mono">
                      {d.appointment?.reference}
                    </Link>
                  ) : (
                    <span className="font-mono">{d.order?.reference}</span>
                  ),
                },
              ]}
            />
            <p className="mt-4 whitespace-pre-line rounded-xl bg-muted/60 p-4 text-sm">{d.description}</p>
            {d.resolution ? (
              <Notice tone="gold" className="mt-4" title={`${t('resolution')}: ${d.resolution_type ? te(`resolution.${d.resolution_type as 'no_refund'}`) : ''}`}>
                {d.resolution}
              </Notice>
            ) : null}
          </Section>
          <Section title={t('evidence')} description={t('evidenceHint')}>
            <DocumentList documents={docs} currentUserId={userId} />
          </Section>
          <Section title={t('messages')}>
            <ul className="mb-4 space-y-3">
              {(messages ?? []).map((m) => (
                <li key={m.id} className="rounded-xl border p-3">
                  <div className="mb-1 text-xs text-muted-foreground">
                    {m.author?.full_name ?? '—'} · {formatDateTime(m.created_at, locale)}
                  </div>
                  <p className="whitespace-pre-line text-sm">{m.body}</p>
                </li>
              ))}
            </ul>
            {open ? <NoteComposer placeholder={t('description')} submitLabel={t('messages')} onSubmit={submit} successMessage={t('messages')} /> : null}
          </Section>
        </div>
        {admin && open ? (
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Section title={t('resolution')}>
              <ResolveDisputeForm id={id} />
            </Section>
          </aside>
        ) : null}
      </div>
    </>
  )
}
