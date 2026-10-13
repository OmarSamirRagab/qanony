'use client'
import { Copy, Download, FolderInput } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/overlay'
import { uploadDocument } from '@/features/documents/upload-client'

export function TemplateFiller({ title, body, variables, matters }: { title: string; body: string; variables: string[]; matters: { id: string; label: string }[] }) {
  const t = useTranslations('matters.templates')
  const tc = useTranslations('common')
  const te = useTranslations('errors')
  const [values, setValues] = useState<Record<string, string>>({})
  const [matterId, setMatterId] = useState('')
  const [pending, start] = useTransition()
  const output = useMemo(() => variables.reduce((acc, v) => acc.replaceAll(`{{${v}}}`, values[v] || `[${v}]`), body), [body, variables, values])
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">{t('use')}</Button>
      </DialogTrigger>
      <DialogContent title={title} description={t('draftWarning')} closeLabel={tc('close')} className="max-w-4xl">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-semibold">{t('fill')}</div>
            {variables.map((v) =>
              ['facts', 'issues', 'options', 'next_steps', 'body', 'obligations', 'preamble', 'progress', 'summary', 'scope'].includes(v) ? (
                <FormField key={v} id={`tv-${v}`} label={v}>
                  <Textarea id={`tv-${v}`} rows={3} value={values[v] ?? ''} onChange={(e) => setValues({ ...values, [v]: e.target.value })} />
                </FormField>
              ) : (
                <FormField key={v} id={`tv-${v}`} label={v}>
                  <Input id={`tv-${v}`} value={values[v] ?? ''} onChange={(e) => setValues({ ...values, [v]: e.target.value })} />
                </FormField>
              ),
            )}
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold">{t('preview')}</div>
            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/40 p-4 font-sans text-sm leading-relaxed">{output}</pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(output)
                  toast.success(tc('copied'))
                }}
              >
                <Copy aria-hidden /> {t('copy')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const url = URL.createObjectURL(new Blob([output], { type: 'text/plain;charset=utf-8' }))
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${title}.txt`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                <Download aria-hidden /> {t('download')}
              </Button>
            </div>
            {matters.length ? (
              <div className="mt-3 flex gap-2">
                <NativeSelect value={matterId} onChange={(e) => setMatterId(e.target.value)} aria-label={t('saveToMatter')} className="h-9">
                  <option value="">{t('saveToMatter')}…</option>
                  {matters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  size="sm"
                  disabled={!matterId}
                  loading={pending}
                  onClick={() =>
                    start(async () => {
                      const file = new File([output], `${title}.txt`, { type: 'text/plain' })
                      const res = await uploadDocument(file, { category: 'other', title: `${title} (${t('draftWarning').split('—')[0]?.trim()})`, matterId })
                      if (!res.ok) return void toast.error(te(res.error))
                      toast.success(tc('saved'))
                    })
                  }
                >
                  <FolderInput aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
