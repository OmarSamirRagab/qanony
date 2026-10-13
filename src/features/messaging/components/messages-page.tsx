import { ArrowRight, Lock, MessagesSquare } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { Avatar } from '@/components/ui/primitives'
import { Link } from '@/i18n/navigation'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { canPost } from '../actions'
import { getConversation, listConversations } from '../queries'
import { ChatThread } from './chat-thread'

/** Two-pane inbox shared by the client and lawyer portals. */
export async function MessagesPage({ portal, userId, conversationId }: { portal: 'client' | 'lawyer'; userId: string; conversationId?: string }) {
  const t = await getTranslations('dashboard.messages')
  const locale = await getLocale()
  const conversations = await listConversations(userId)
  const active = conversationId ? await getConversation(conversationId) : null
  if (conversationId && !active) notFound()
  const postable = active ? await canPost(active.id) : false
  const base = `/${portal}/messages`

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="grid h-[calc(100dvh-14rem)] min-h-[480px] overflow-hidden rounded-xl border bg-card shadow-soft md:grid-cols-[320px_1fr]">
        <aside className={cn('min-h-0 overflow-y-auto border-e', active && 'hidden md:block')}>
          {conversations.length === 0 ? (
            <EmptyState icon={MessagesSquare} title={t('empty')} className="m-4 border-0" />
          ) : (
            <ul>
              {conversations.map((c) => {
                const other = c.others[0]
                return (
                  <li key={c.id}>
                    <Link
                      href={`${base}/${c.id}`}
                      className={cn('flex gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/60', c.id === conversationId && 'bg-gold-soft/50')}
                      aria-current={c.id === conversationId ? 'page' : undefined}
                    >
                      <Avatar name={other?.name} src={other?.avatar} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold">{c.others.map((o) => o.name).join('، ') || c.subject}</span>
                          {c.lastMessageAt ? <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(c.lastMessageAt, locale)}</span> : null}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">{c.lastMessage ?? c.subject}</span>
                          {c.unread > 0 ? <Badge variant="gold" className="px-1.5 text-[10px]">{c.unread}</Badge> : null}
                        </div>
                        <span className="text-[10px] font-semibold text-muted-foreground/80">{t(`kind.${c.kind as 'appointment'}`)}</span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>
        <section className={cn('flex min-h-0 flex-col', !active && 'hidden md:flex')}>
          {active ? (
            <>
              <header className="flex items-center gap-3 border-b px-4 py-3">
                <Link href={base} className="md:hidden" aria-label={t('back')}>
                  <ArrowRight className="size-5 ltr:rotate-180" />
                </Link>
                <div className="min-w-0">
                  <div className="truncate font-bold">
                    {active.participants
                      .filter((p) => p.user_id !== userId)
                      .map((p) => p.profile?.full_name ?? '—')
                      .join('، ')}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="size-3" aria-hidden /> {t('confidential')} {active.subject ? `· ${active.subject}` : ''}
                  </div>
                </div>
              </header>
              <div className="min-h-0 flex-1">
                <ChatThread
                  conversationId={active.id}
                  userId={userId}
                  canPost={postable}
                  participants={active.participants.map((p) => ({ id: p.user_id, name: p.profile?.full_name ?? '—', lastReadAt: p.last_read_at }))}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <MessagesSquare className="me-2 size-5 text-gold" aria-hidden /> {t('select')}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
