import { CalendarClock, Gavel, ListChecks, Lock, MessagesSquare, Receipt, StickyNote, Users } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { DescriptionList, EmptyState, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { NoteComposer } from '@/components/shared/note-composer'
import { Breadcrumbs } from '@/components/shared/server'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/primitives'
import { DocumentList } from '@/features/documents/components/document-list'
import { DocumentUploader } from '@/features/documents/components/document-uploader'
import { getCategories } from '@/features/reference/queries'
import { Link } from '@/i18n/navigation'
import { formatMoney } from '@/lib/domain/money'
import { formatDate, formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn, pick } from '@/lib/utils'
import { addMatterNote, addMatterUpdate } from '../actions'
import { getMatter } from '../queries'
import { ExpenseDialog, HearingDialog, MatterForm, MatterStatusChanger, MemberAssign, RemoveMemberButton, TaskDialog, TaskStatusSelect } from './matter-forms'
import { OpenMatterChatButton } from './open-chat-button'

type Viewer = 'client' | 'lawyer' | 'firm'
const TABS = ['overview', 'timeline', 'tasks', 'hearings', 'documents', 'notes', 'expenses', 'team', 'billing'] as const
const CLIENT_TABS = ['overview', 'timeline', 'hearings', 'documents', 'notes'] as const

export async function MatterDetailView({ id, viewer, userId, tab: rawTab }: { id: string; viewer: Viewer; userId: string; tab?: string }) {
  const data = await getMatter(id)
  if (!data) notFound()
  const { matter, events, tasks, hearings, notes, expenses, members, documents, invoices, conversationId } = data
  const t = await getTranslations('matters')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const supabase = await createClient()
  const isClient = viewer === 'client'
  const portalBase = viewer === 'firm' ? '/firm/matters' : `/${viewer}/matters`
  const firmQuery = viewer === 'firm' && matter.firm_id ? `&firm=${matter.firm_id}` : ''

  let canEdit = false
  let canAssign = false
  let firmPerms: string[] = []
  if (!isClient) {
    if (matter.firm_id) {
      const { data: perms } = await supabase.rpc('my_firm_permissions', { p_firm_id: matter.firm_id })
      firmPerms = perms ?? []
    }
    canEdit = matter.owner_lawyer_id === userId || members.some((m) => m.user_id === userId && m.can_edit) || firmPerms.includes('matters.edit')
    canAssign = matter.owner_lawyer_id === userId || firmPerms.includes('matters.assign')
  }
  canEdit = canEdit && matter.status !== 'ARCHIVED'

  const tabs = isClient ? CLIENT_TABS : TABS
  const tab = (tabs as readonly string[]).includes(rawTab ?? '') ? (rawTab as (typeof TABS)[number]) : 'overview'

  // Options for forms
  const memberOptions = [
    ...(matter.owner ? [{ id: matter.owner.id, label: pick(locale, matter.owner.display_name_ar, matter.owner.display_name_en) }] : []),
    ...members.filter((m) => m.user_id !== matter.owner_lawyer_id).map((m) => ({ id: m.user_id, label: m.profile?.full_name ?? '—' })),
  ]
  let candidates: { id: string; label: string }[] = []
  let clientOptions: { id: string; label: string }[] = []
  let categoryOptions: { id: string; label: string }[] = []
  if (canEdit) {
    const categories = await getCategories()
    categoryOptions = categories.map((c) => ({ id: c.id, label: pick(locale, c.name_ar, c.name_en) }))
    const { data: pcs } = matter.firm_id
      ? await supabase.from('practice_clients').select('id, full_name').eq('firm_id', matter.firm_id).order('full_name').limit(500)
      : await supabase.from('practice_clients').select('id, full_name').eq('owner_lawyer_id', matter.owner_lawyer_id).order('full_name').limit(500)
    clientOptions = (pcs ?? []).map((c) => ({ id: c.id, label: c.full_name }))
  }
  if (canAssign && matter.firm_id) {
    const { data: fm } = await supabase.from('law_firm_members').select('user_id, profile:profiles!law_firm_members_user_id_fkey(full_name)').eq('firm_id', matter.firm_id).eq('status', 'active')
    const existing = new Set([matter.owner_lawyer_id, ...members.map((m) => m.user_id)])
    candidates = (fm ?? []).filter((m) => m.user_id && !existing.has(m.user_id)).map((m) => ({ id: m.user_id!, label: m.profile?.full_name ?? '—' }))
  }

  const visibleEvents = isClient ? events.filter((e) => e.visibility === 'shared') : events
  const visibleHearings = isClient ? hearings.filter((h) => h.visible_to_client) : hearings
  const visibleDocs = isClient ? documents.filter((d) => d.shared_with_client) : documents
  const visibleNotes = isClient ? notes.filter((n) => n.visibility === 'shared') : notes.filter((n) => n.visibility !== 'private' || n.author_id === userId)
  const now = new Date()

  async function submitUpdate(body: string, visibility: string) {
    'use server'
    return addMatterUpdate(id, body, visibility === 'shared')
  }
  async function submitNote(body: string, visibility: string) {
    'use server'
    return addMatterNote(id, body, (isClient ? 'shared' : visibility) as 'shared')
  }

  const header = (
    <PageHeader
      eyebrow={<span className="font-mono">{matter.reference}</span>}
      title={matter.title}
      description={matter.firm ? pick(locale, matter.firm.name_ar, matter.firm.name_en) : undefined}
      actions={
        <>
          <StatusBadge status={matter.status} label={te(`matter.${matter.status}`)} className="text-sm" />
          {canEdit ? <MatterStatusChanger matterId={id} status={matter.status} /> : null}
          {canEdit ? (
            <MatterForm mode="edit" initial={matter} clients={clientOptions} categories={categoryOptions} basePath={portalBase} />
          ) : null}
          {conversationId ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/${isClient ? 'client' : 'lawyer'}/messages/${conversationId}`}>
                <MessagesSquare aria-hidden /> {t('openChat')}
              </Link>
            </Button>
          ) : (
            <OpenMatterChatButton matterId={id} portal={isClient ? 'client' : 'lawyer'} label={t('openChat')} />
          )}
        </>
      }
    />
  )

  return (
    <>
      <Breadcrumbs items={[{ label: isClient ? t('clientTitle') : t('title'), href: `${portalBase}${firmQuery ? `?${firmQuery.slice(1)}` : ''}` }, { label: matter.reference }]} />
      {header}
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b" aria-label="tabs">
        {tabs.map((k) => (
          <Link
            key={k}
            href={`${portalBase}/${id}?tab=${k}${firmQuery}`}
            className={cn('shrink-0 border-b-2 px-3 py-2 text-sm font-semibold', tab === k ? 'border-gold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
            aria-current={tab === k ? 'page' : undefined}
          >
            {t(`tabs.${k}`)}
          </Link>
        ))}
      </nav>

      {tab === 'overview' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Section>
            <DescriptionList
              items={[
                { label: t('client'), value: matter.client_record?.full_name ?? t('noClient') },
                { label: t('lead'), value: matter.owner ? pick(locale, matter.owner.display_name_ar, matter.owner.display_name_en) : '—' },
                { label: t('category'), value: matter.category ? pick(locale, matter.category.name_ar, matter.category.name_en) : '—' },
                { label: t('priority'), value: te(`priority.${matter.priority}`) },
                { label: t('openedAt'), value: formatDate(matter.opened_at, locale) },
                { label: t('opposingParty'), value: matter.opposing_party ?? '—' },
                ...(!isClient
                  ? [
                      { label: t('billingType'), value: te(`billingType.${matter.billing_type as 'fixed'}`) },
                      { label: t('agreedFee'), value: matter.agreed_fee_minor != null ? formatMoney(matter.agreed_fee_minor, locale) : '—' },
                    ]
                  : []),
              ]}
            />
            {matter.description ? <p className="mt-5 whitespace-pre-line rounded-xl bg-muted/60 p-4 text-sm leading-relaxed">{matter.description}</p> : null}
            {!isClient && matter.client_record && !matter.client_record.user_id ? <Notice tone="info" className="mt-4" title={t('clientNoAccount')} /> : null}
          </Section>
          <div className="space-y-4">
            <Section title={t('hearings.upcoming')}>
              {visibleHearings.filter((h) => new Date(h.hearing_at) >= now).slice(0, 3).length ? (
                <ul className="space-y-3">
                  {visibleHearings
                    .filter((h) => new Date(h.hearing_at) >= now)
                    .slice(-3)
                    .map((h) => (
                      <li key={h.id} className="flex gap-2 text-sm">
                        <Gavel className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                        <div>
                          <div className="font-semibold">{h.court_name}</div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(h.hearing_at, locale)}</div>
                        </div>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t('hearings.empty')}</p>
              )}
            </Section>
            {!isClient ? (
              <Section title={t('tabs.tasks')}>
                <p className="text-sm text-muted-foreground">
                  {tasks.filter((x) => !['done', 'cancelled'].includes(x.status)).length} · {t('tasks.overdue')}:{' '}
                  {tasks.filter((x) => !['done', 'cancelled'].includes(x.status) && x.due_at && new Date(x.due_at) < now).length}
                </p>
              </Section>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'timeline' ? (
        <Section>
          {canEdit ? (
            <div className="mb-5">
              <NoteComposer
                placeholder={t('timeline.updatePlaceholder')}
                submitLabel={t('timeline.addUpdate')}
                visibilityOptions={[
                  { value: 'internal', label: t('timeline.internal') },
                  { value: 'shared', label: t('timeline.shareWithClient') },
                ]}
                onSubmit={submitUpdate}
                successMessage={t('saved')}
              />
            </div>
          ) : null}
          {visibleEvents.length ? (
            <ol className="relative space-y-5 border-s ps-5">
              {visibleEvents.map((e) => (
                <li key={e.id} className="relative">
                  <span className={cn('absolute -start-[1.65rem] top-1 size-3 rounded-full border-2 border-card', e.visibility === 'shared' ? 'bg-gold' : 'bg-muted-foreground/50')} aria-hidden />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{e.summary}</span>
                    {!isClient && e.visibility === 'internal' ? (
                      <Badge variant="outline" className="text-[10px]">
                        <Lock aria-hidden /> {t('timeline.internal')}
                      </Badge>
                    ) : null}
                  </div>
                  {e.event_type === 'matter.status_changed' ? (
                    <div className="text-xs text-muted-foreground">
                      {te(`matter.${(e.details as { from: string }).from as 'NEW'}`)} ← {te(`matter.${(e.details as { to: string }).to as 'NEW'}`)}
                    </div>
                  ) : null}
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(e.occurred_at, locale)}
                    {e.actor?.full_name ? ` · ${e.actor.full_name}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState icon={CalendarClock} title={t('timeline.empty')} className="border-0" />
          )}
        </Section>
      ) : null}

      {tab === 'tasks' && !isClient ? (
        <Section title={t('tabs.tasks')} action={canEdit ? <TaskDialog matterId={id} members={memberOptions} /> : null}>
          {tasks.length ? (
            <ul className="divide-y">
              {tasks.map((task) => {
                const overdue = task.due_at && new Date(task.due_at) < now && !['done', 'cancelled'].includes(task.status)
                return (
                  <li key={task.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className={cn('font-semibold', task.status === 'done' && 'text-muted-foreground line-through')}>{task.title}</div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span>{task.assignee?.full_name ?? t('tasks.unassigned')}</span>
                        {task.due_at ? <span className={cn(overdue && 'font-bold text-destructive')}>{formatDateTime(task.due_at, locale)}</span> : null}
                        <span>{te(`priority.${task.priority}`)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {canEdit || task.assignee_id === userId ? <TaskStatusSelect taskId={task.id} status={task.status} /> : <Badge variant="muted">{te(`taskStatus.${task.status as 'todo'}`)}</Badge>}
                      {canEdit ? <TaskDialog matterId={id} members={memberOptions} task={task} /> : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState icon={ListChecks} title={t('tasks.empty')} className="border-0" />
          )}
        </Section>
      ) : null}

      {tab === 'hearings' ? (
        <Section title={t('tabs.hearings')} description={t('hearings.manualNote')} action={canEdit ? <HearingDialog matterId={id} lawyers={memberOptions} /> : null}>
          {visibleHearings.length ? (
            <ul className="space-y-3">
              {visibleHearings.map((h) => (
                <li key={h.id} className={cn('rounded-xl border p-4', new Date(h.hearing_at) >= now && 'border-gold/40 bg-gold-soft/30')}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold">{h.court_name}</div>
                      <div className="text-sm text-muted-foreground">{formatDateTime(h.hearing_at, locale)}</div>
                    </div>
                    {canEdit ? <HearingDialog matterId={id} lawyers={memberOptions} hearing={h} /> : null}
                  </div>
                  <DescriptionList
                    className="mt-3"
                    items={[
                      { label: t('hearings.caseNumber'), value: h.case_number ? <span className="ltr-nums">{h.case_number}</span> : '—' },
                      { label: t('hearings.circuit'), value: h.circuit ?? '—' },
                      { label: t('hearings.location'), value: h.court_location ?? '—' },
                      { label: t('hearings.purpose'), value: h.purpose ?? '—' },
                      ...(h.outcome ? [{ label: t('hearings.outcome'), value: h.outcome }] : []),
                      ...(h.next_hearing_at ? [{ label: t('hearings.nextHearing'), value: formatDateTime(h.next_hearing_at, locale) }] : []),
                      ...(!isClient && h.notes ? [{ label: t('hearings.notes'), value: h.notes }] : []),
                    ]}
                  />
                  {!isClient ? <Badge variant={h.visible_to_client ? 'info' : 'outline'} className="mt-3">{h.visible_to_client ? t('hearings.visibleToClient') : t('timeline.internal')}</Badge> : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Gavel} title={t('hearings.empty')} className="border-0" />
          )}
        </Section>
      ) : null}

      {tab === 'documents' ? (
        <Section
          title={t('tabs.documents')}
          action={canEdit || isClient ? <DocumentUploader target={{ matterId: id }} allowShareWithClient={canEdit} defaultCategory="case_document" /> : null}
        >
          <DocumentList documents={visibleDocs} currentUserId={userId} matterId={isClient ? undefined : id} canShareWithClient={canEdit} />
        </Section>
      ) : null}

      {tab === 'notes' ? (
        <Section title={t('tabs.notes')}>
          <div className="mb-5">
            <NoteComposer
              placeholder={isClient ? t('notes.clientNote') : t('notes.placeholder')}
              submitLabel={t('notes.add')}
              visibilityOptions={
                isClient || !canEdit
                  ? undefined
                  : [
                      { value: 'internal', label: te('noteVisibility.internal') },
                      { value: 'private', label: te('noteVisibility.private') },
                      { value: 'shared', label: te('noteVisibility.shared') },
                    ]
              }
              defaultVisibility={isClient ? 'shared' : 'internal'}
              onSubmit={submitNote}
              successMessage={t('notes.saved')}
            />
          </div>
          {visibleNotes.length ? (
            <ul className="space-y-3">
              {visibleNotes.map((n) => (
                <li key={n.id} className="rounded-xl border p-3">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {n.author?.full_name ?? ''} · {formatDateTime(n.created_at, locale)}
                    </span>
                    {!isClient ? <Badge variant={n.visibility === 'shared' ? 'info' : 'outline'}>{te(`noteVisibility.${n.visibility as 'private'}`)}</Badge> : null}
                  </div>
                  <p className="whitespace-pre-line text-sm">{n.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={StickyNote} title={t('notes.empty')} className="border-0" />
          )}
        </Section>
      ) : null}

      {tab === 'expenses' && !isClient ? (
        <Section title={t('tabs.expenses')} action={canEdit ? <ExpenseDialog matterId={id} /> : null}>
          {expenses.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 text-start font-semibold">{t('expenses.description')}</th>
                      <th className="py-2 text-start font-semibold">{t('expenses.date')}</th>
                      <th className="py-2 text-start font-semibold">{t('expenses.billable')}</th>
                      <th className="py-2 text-end font-semibold">{t('expenses.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((x) => (
                      <tr key={x.id} className="border-b last:border-0">
                        <td className="py-2">{x.description}</td>
                        <td className="py-2">{formatDate(x.incurred_on, locale)}</td>
                        <td className="py-2">{x.billable ? tc('yes') : tc('no')}</td>
                        <td className="py-2 text-end tabular-nums">{formatMoney(x.amount_minor, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-end text-sm font-bold">
                {t('expenses.total')}: {formatMoney(expenses.reduce((s, x) => s + x.amount_minor, 0), locale)}
              </p>
            </>
          ) : (
            <EmptyState icon={Receipt} title={t('expenses.empty')} className="border-0" />
          )}
        </Section>
      ) : null}

      {tab === 'team' && !isClient ? (
        <Section title={t('tabs.team')} action={canAssign && matter.firm_id ? <MemberAssign matterId={id} candidates={candidates} /> : null}>
          {!matter.firm_id ? <Notice tone="info" className="mb-4" title={t('team.personalNote')} /> : null}
          <ul className="divide-y">
            {matter.owner ? (
              <li className="flex items-center gap-3 py-3">
                <Avatar name={pick(locale, matter.owner.display_name_ar, matter.owner.display_name_en)} />
                <div className="flex-1 font-semibold">{pick(locale, matter.owner.display_name_ar, matter.owner.display_name_en)}</div>
                <Badge variant="gold">{t('team.roles.lead')}</Badge>
              </li>
            ) : null}
            {members
              .filter((m) => m.user_id !== matter.owner_lawyer_id)
              .map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 py-3">
                  <Avatar name={m.profile?.full_name} src={m.profile?.avatar_url} />
                  <div className="flex-1">
                    <div className="font-semibold">{m.profile?.full_name}</div>
                    <div className="text-xs text-muted-foreground">{m.can_edit ? t('team.canEdit') : tc('none')}</div>
                  </div>
                  <Badge variant="secondary">{t(`team.roles.${m.role as 'staff'}`)}</Badge>
                  {canAssign ? <RemoveMemberButton matterId={id} userId={m.user_id} /> : null}
                </li>
              ))}
          </ul>
          {members.length <= 1 ? <p className="mt-2 text-sm text-muted-foreground">{t('team.empty')}</p> : null}
        </Section>
      ) : null}

      {tab === 'billing' && !isClient ? (
        <Section title={t('tabs.billing')}>
          {invoices.length ? (
            <ul className="divide-y">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <Link href={`/invoices/${inv.id}`} className="font-mono font-semibold hover:text-gold">
                    {inv.number}
                  </Link>
                  <span>{formatMoney(inv.total_minor, locale)}</span>
                  <StatusBadge status={inv.status} label={inv.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Users} title={tc('noData')} className="border-0" />
          )}
        </Section>
      ) : null}
    </>
  )
}
