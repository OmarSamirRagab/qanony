'use client'
import { Copy, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Markdown } from '@/components/shared/markdown'
import { Notice } from '@/components/shared/notices-client'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/primitives'
import { runLawyerTool } from '../actions'

const TASKS = ['summarize', 'clauses', 'compare', 'draft', 'meeting', 'timeline'] as const
type Task = (typeof TASKS)[number]

export function LawyerTools({ documents, matters }: { documents: { id: string; title: string }[]; matters: { id: string; label: string }[] }) {
  const t = useTranslations('ai.tools')
  const tc = useTranslations('common')
  const te = useTranslations('errors')
  const [task, setTask] = useState<Task>('summarize')
  const [selected, setSelected] = useState<string[]>([])
  const [matterId, setMatterId] = useState('')
  const [instructions, setInstructions] = useState('')
  const [result, setResult] = useState<{ text: string; status: string } | null>(null)
  const [pending, start] = useTransition()
  const needsDocs = task === 'summarize' || task === 'clauses' || task === 'compare'
  const maxDocs = task === 'compare' ? 2 : task === 'summarize' || task === 'clauses' ? 2 : 0
  const ready = (needsDocs ? (task === 'compare' ? selected.length === 2 : selected.length >= 1) : true) && (task !== 'timeline' || matterId) && (task !== 'draft' && task !== 'meeting' ? true : instructions.trim().length > 10)

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-soft">
        <FormField id="ai-task" label={t('task')}>
          <NativeSelect id="ai-task" value={task} onChange={(e) => { setTask(e.target.value as Task); setSelected([]) }}>
            {TASKS.map((k) => (
              <option key={k} value={k}>
                {t(`tasks.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {needsDocs ? (
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">{t('documents')}</legend>
            <p className="mb-2 text-xs text-muted-foreground">{t('documentsHint')}</p>
            {documents.length ? (
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {documents.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected.includes(d.id)}
                      disabled={!selected.includes(d.id) && selected.length >= maxDocs}
                      onCheckedChange={(v) => setSelected(v ? [...selected, d.id] : selected.filter((x) => x !== d.id))}
                    />
                    <span className="truncate">{d.title}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noDocuments')}</p>
            )}
          </fieldset>
        ) : null}
        <FormField id="ai-matter" label={t('matter')}>
          <NativeSelect id="ai-matter" value={matterId} onChange={(e) => setMatterId(e.target.value)}>
            <option value="">{t('selectMatter')}</option>
            {matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="ai-instr" label={t('instructions')}>
          <Textarea id="ai-instr" rows={5} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={t('instructionsPlaceholder')} maxLength={8000} />
        </FormField>
        <Button
          variant="gold"
          className="w-full"
          disabled={!ready}
          loading={pending}
          onClick={() =>
            start(async () => {
              setResult(null)
              const res = await runLawyerTool({ task, documentIds: selected, matterId: matterId || null, instructions })
              if (!res.ok) {
                const detail = res.detail && ['document_ai_not_allowed', 'no_owner_consent', 'unsupported_type'].includes(res.detail) ? t(`blocked.${res.detail as 'no_owner_consent'}`) : undefined
                toast.error(detail ?? (res.error === 'notConfigured' ? t('unavailable') : te(res.error)))
                return
              }
              setResult({ text: res.data.text, status: res.data.status })
            })
          }
        >
          <Sparkles aria-hidden /> {t('run')}
        </Button>
      </section>
      <section className="min-h-64 rounded-xl border bg-card p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{t('result')}</h2>
          {result ? (
            <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(result.text); toast.success(tc('copied')) }}>
              <Copy aria-hidden /> {t('copy')}
            </Button>
          ) : null}
        </div>
        {pending ? <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-muted" />)}</div> : null}
        {result ? (
          <>
            <Badge variant="gold" className="mb-3">
              <Sparkles aria-hidden /> {tc('aiLabel')}
            </Badge>
            <Notice tone="warning" title={t('reviewWarning')} className="mb-4" />
            <Markdown source={result.status === 'refused' ? te('forbidden') : result.text} />
          </>
        ) : null}
      </section>
    </div>
  )
}
