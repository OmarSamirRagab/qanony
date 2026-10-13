'use client'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CheckCheck, FileText, Loader2, Lock, Paperclip, SendHorizontal, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { formatTime } from '@/lib/format'
import { ACCEPT_ATTR, isAllowedFile } from '@/lib/files'
import { getBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { uploadDocument } from '@/features/documents/upload-client'
import { markConversationRead, sendMessage } from '../actions'

interface Msg {
  id: string
  sender_id: string | null
  body: string
  kind: string
  created_at: string
  edited_at: string | null
  attachments: { document_id: string; document: { title: string } | null }[]
}

const PAGE = 40

export function ChatThread({
  conversationId,
  userId,
  canPost,
  participants,
}: {
  conversationId: string
  userId: string
  canPost: boolean
  participants: { id: string; name: string; lastReadAt: string | null }[]
}) {
  const t = useTranslations('dashboard.messages')
  const te = useTranslations('errors')
  const locale = useLocale()
  const qc = useQueryClient()
  const key = useMemo(() => ['messages', conversationId], [conversationId])
  const bottomRef = useRef<HTMLDivElement>(null)
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [pending, start] = useTransition()
  const [othersRead, setOthersRead] = useState<string | null>(
    participants.filter((p) => p.id !== userId).map((p) => p.lastReadAt).sort().at(-1) ?? null,
  )

  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = getBrowserClient()
        .from('messages')
        .select('id, sender_id, body, kind, created_at, edited_at, attachments:message_attachments(document_id, document:documents(title))')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (pageParam) q = q.lt('created_at', pageParam)
      const { data, error } = await q
      if (error) throw error
      return data as unknown as Msg[]
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1]!.created_at : null),
  })

  const messages = useMemo(() => (query.data?.pages.flat() ?? []).slice().reverse(), [query.data])
  const dayLabel = (iso: string) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' }).format(new Date(iso))

  // Realtime: RLS ensures only participants receive rows for this conversation.
  useEffect(() => {
    const supabase = getBrowserClient()
    const channel = supabase
      .channel(`conv:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, () => {
        void qc.invalidateQueries({ queryKey: key })
        void markConversationRead(conversationId)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const row = payload.new as { user_id: string; last_read_at: string }
        if (row.user_id !== userId) setOthersRead((prev) => (!prev || row.last_read_at > prev ? row.last_read_at : prev))
      })
      .subscribe()
    void markConversationRead(conversationId)
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, key, qc, userId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const names = new Map(participants.map((p) => [p.id, p.name]))

  function submit() {
    const text = body.trim()
    if (!text && !files.length) return
    start(async () => {
      const ids: string[] = []
      for (const f of files) {
        const up = await uploadDocument(f, { category: 'other' })
        if (up.ok) ids.push(up.documentId)
        else toast.error(`${f.name}: ${te(up.error)}`)
      }
      const res = await sendMessage(conversationId, text || t('attachment'), ids)
      if (!res.ok) return void toast.error(te(res.error))
      setBody('')
      setFiles([])
      void qc.invalidateQueries({ queryKey: key })
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-live="polite">
        {query.hasNextPage ? (
          <div className="text-center">
            <Button variant="ghost" size="sm" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
              …
            </Button>
          </div>
        ) : null}
        {query.isLoading ? <Loader2 className="mx-auto size-5 animate-spin text-gold" /> : null}
        {messages.map((m, i) => {
          const mine = m.sender_id === userId
          const day = dayLabel(m.created_at)
          const prev = messages[i - 1]
          const showDay = !prev || dayLabel(prev.created_at) !== day
          return (
            <div key={m.id}>
              {showDay ? <div className="my-3 text-center text-[11px] font-semibold text-muted-foreground">{day}</div> : null}
              {m.kind === 'system' ? (
                <div className="text-center text-xs text-muted-foreground">{m.body}</div>
              ) : (
                <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-xs', mine ? 'rounded-ee-sm bg-primary text-primary-foreground' : 'rounded-es-sm border bg-card')}>
                    {!mine ? <div className="mb-0.5 text-[11px] font-bold text-gold">{names.get(m.sender_id ?? '') ?? ''}</div> : null}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    {m.attachments.map((a) => (
                      <a
                        key={a.document_id}
                        href={`/api/documents/${a.document_id}/download`}
                        className={cn('mt-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs underline-offset-2 hover:underline', mine ? 'bg-white/10' : 'bg-muted')}
                      >
                        <FileText className="size-3.5" aria-hidden /> {a.document?.title ?? t('attachment')}
                      </a>
                    ))}
                    <div className={cn('mt-1 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                      {m.edited_at ? <span>{t('edited')}</span> : null}
                      <span>{formatTime(m.created_at, locale)}</span>
                      {mine ? (
                        othersRead && othersRead >= m.created_at ? <CheckCheck className="size-3.5" aria-label={t('read')} /> : <Check className="size-3.5" aria-hidden />
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <div className="border-t bg-card p-3">
        {canPost ? (
          <>
            {files.length ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                    <Paperclip className="size-3" aria-hidden /> {f.name}
                    <button type="button" className="cursor-pointer" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label="remove">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border hover:bg-muted" aria-label={t('attach')}>
                <Paperclip className="size-4" aria-hidden />
                <input
                  type="file"
                  accept={ACCEPT_ATTR}
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f && isAllowedFile(f)) setFiles((x) => [...x, f].slice(0, 5))
                    else if (f) toast.error(te('invalidFile'))
                    e.target.value = ''
                  }}
                />
              </label>
              <Textarea
                rows={1}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder={t('placeholder')}
                aria-label={t('placeholder')}
                className="max-h-40 min-h-10 py-2"
                maxLength={10000}
              />
              <Button type="submit" size="icon" loading={pending} aria-label={t('send')}>
                {!pending ? <SendHorizontal className="rtl:rotate-180" aria-hidden /> : null}
              </Button>
            </form>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Lock className="size-4" aria-hidden /> {t('closed')}
          </p>
        )}
      </div>
    </div>
  )
}
