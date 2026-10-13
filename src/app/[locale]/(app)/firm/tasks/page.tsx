import { ListChecks } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { getFirmContext } from '@/features/firms/context'
import { TaskStatusSelect } from '@/features/matters/components/matter-forms'
import { Link } from '@/i18n/navigation'
import { formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export default async function FirmTasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { ctx, firm, can } = await getFirmContext()
  const { view: rawView } = await searchParams
  const view = rawView === 'all' && can('matters.view') ? 'all' : rawView === 'overdue' ? 'overdue' : 'mine'
  const t = await getTranslations('firm.tasks')
  const te = await getTranslations('enums')
  const locale = await getLocale()
  const supabase = await createClient()
  let q = supabase
    .from('matter_tasks')
    .select('id, title, status, priority, due_at, assignee_id, assignee:profiles!matter_tasks_assignee_id_fkey(full_name), matter:legal_matters!inner(id, reference, firm_id)')
    .eq('matter.firm_id', firm.firm_id)
    .not('status', 'in', '(done,cancelled)')
  if (view === 'mine') q = q.eq('assignee_id', ctx.userId)
  if (view === 'overdue') q = q.lt('due_at', new Date().toISOString())
  const { data } = await q.order('due_at', { ascending: true, nullsFirst: false }).limit(300)
  const now = new Date().getTime()
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="mb-5 inline-flex h-10 items-center gap-1 rounded-lg bg-muted p-1">
        {(['mine', 'overdue', ...(can('matters.view') ? ['all'] : [])] as const).map((v) => (
          <Link key={v} href={`/firm/tasks?view=${v}`} className={cn('rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground', view === v && 'bg-card text-foreground shadow-sm')}>
            {t(v as 'mine')}
          </Link>
        ))}
      </div>
      {data?.length ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
          {data.map((task) => {
            const overdue = task.due_at && new Date(task.due_at).getTime() < now
            return (
              <li key={task.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{task.title}</div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <Link href={`/firm/matters/${task.matter.id}?tab=tasks`} className="font-mono hover:text-gold">
                      {task.matter.reference}
                    </Link>
                    <span>{task.assignee?.full_name ?? '—'}</span>
                    {task.due_at ? <span className={cn(overdue && 'font-bold text-destructive')}>{formatDateTime(task.due_at, locale)}</span> : null}
                  </div>
                </div>
                <Badge variant={task.priority === 'urgent' ? 'danger' : 'muted'}>{te(`priority.${task.priority}`)}</Badge>
                {task.assignee_id === ctx.userId || can('matters.edit') ? <TaskStatusSelect taskId={task.id} status={task.status} /> : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState icon={ListChecks} title={t('empty')} />
      )}
    </>
  )
}
