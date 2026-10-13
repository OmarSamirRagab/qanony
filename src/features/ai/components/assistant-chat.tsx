'use client'
import { Bot, Sparkles, User } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { Markdown } from '@/components/shared/markdown'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { askAssistant } from '../actions'

interface Turn {
  role: 'user' | 'ai'
  text: string
  status?: 'ok' | 'refused' | 'truncated' | 'error'
  categories?: string[]
}

export function AssistantChat({ categoryNames }: { categoryNames: Record<string, string> }) {
  const t = useTranslations('ai.assistant')
  const tc = useTranslations('common')
  const te = useTranslations('errors')
  const locale = useLocale()
  const [turns, setTurns] = useState<Turn[]>([])
  const [q, setQ] = useState('')
  const [pending, start] = useTransition()

  const ask = (question: string) => {
    if (question.trim().length < 5) return
    setTurns((x) => [...x, { role: 'user', text: question }])
    setQ('')
    start(async () => {
      const res = await askAssistant(question)
      if (!res.ok) setTurns((x) => [...x, { role: 'ai', text: res.error === 'notConfigured' ? t('unavailable') : te(res.error), status: 'error' }])
      else setTurns((x) => [...x, { role: 'ai', text: res.data.status === 'refused' ? t('refused') : res.data.text, status: res.data.status, categories: res.data.categories }])
    })
  }

  return (
    <div className="space-y-4">
      {turns.length === 0 ? (
        <div>
          <div className="mb-2 text-sm font-semibold text-muted-foreground">{t('suggestionsTitle')}</div>
          <div className="flex flex-wrap gap-2">
            {[t('suggestion1'), t('suggestion2'), t('suggestion3')].map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="cursor-pointer rounded-full border bg-card px-3 py-1.5 text-start text-sm hover:border-gold">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <ul className="space-y-4" aria-live="polite">
        {turns.map((turn, i) => (
          <li key={i} className={cn('flex gap-3', turn.role === 'user' && 'flex-row-reverse')}>
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', turn.role === 'user' ? 'bg-muted' : 'bg-navy text-gold')}>
              {turn.role === 'user' ? <User className="size-4" aria-hidden /> : <Bot className="size-4" aria-hidden />}
            </span>
            <div className={cn('max-w-[85%] rounded-2xl border p-4', turn.role === 'user' ? 'bg-muted/60' : 'bg-card')}>
              {turn.role === 'ai' && turn.status !== 'error' ? (
                <Badge variant="gold" className="mb-2">
                  <Sparkles aria-hidden /> {tc('aiLabel')}
                </Badge>
              ) : null}
              {turn.role === 'ai' ? <Markdown source={turn.text} /> : <p className="whitespace-pre-line text-sm">{turn.text}</p>}
              {turn.status === 'truncated' ? <p className="mt-2 text-xs text-warning">{t('truncated')}</p> : null}
              {turn.categories?.length ? (
                <div className="mt-3 border-t pt-3">
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">{t('recommended')}</div>
                  <div className="flex flex-wrap gap-2">
                    {turn.categories.map((c) => (
                      <Link key={c} href={`/lawyers?category=${c}`} className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-accent-foreground hover:underline">
                        {categoryNames[c] ?? c} · {t('findLawyers')}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </li>
        ))}
        {pending ? (
          <li className="flex gap-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-navy text-gold">
              <Bot className="size-4 animate-pulse" aria-hidden />
            </span>
            <div className="h-12 w-48 animate-pulse rounded-2xl bg-muted" />
          </li>
        ) : null}
      </ul>
      <form
        className="sticky bottom-4 flex items-end gap-2 rounded-2xl border bg-card p-3 shadow-lift"
        onSubmit={(e) => {
          e.preventDefault()
          ask(q)
        }}
      >
        <Textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          lang={locale}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ask(q)
            }
          }}
          className="min-h-12 border-0 shadow-none"
        />
        <Button type="submit" variant="gold" loading={pending} disabled={q.trim().length < 5}>
          {t('send')}
        </Button>
      </form>
    </div>
  )
}
