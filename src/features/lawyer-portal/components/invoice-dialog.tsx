'use client'
import { Plus, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/overlay'
import { useRouter } from '@/i18n/navigation'
import { formatMoney, toMinor } from '@/lib/domain/money'
import { invoiceTotals } from '@/lib/domain/invoice'
import { createInvoice, setInvoiceStatus } from '../actions'

export function InvoiceDialog({ clients, matters, firmId }: { clients: { id: string; label: string }[]; matters: { id: string; label: string }[]; firmId?: string | null }) {
  const t = useTranslations('dashboard.invoices')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [matterId, setMatterId] = useState('')
  const [lines, setLines] = useState([{ description: '', quantity: 1, unit: 0 }])
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [pending, start] = useTransition()
  const valid = clientId && lines.every((l) => l.description.trim() && l.quantity > 0 && l.unit >= 0)
  const totals = invoiceTotals(lines.map((l) => ({ description: l.description, quantity: l.quantity || 1, unit_minor: toMinor(l.unit || 0) })))
  const submit = (issue: boolean) =>
    start(async () => {
      const res = await createInvoice({ firmId: firmId ?? null, clientRecordId: clientId, matterId: matterId || null, lines, dueDate, notes, issue })
      if (!res.ok) return void toast.error(res.detail ?? terr(res.error))
      toast.success(issue ? t('issued') : tc('saved'))
      setOpen(false)
      router.refresh()
    })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold" disabled={!clients.length}>
          <Plus aria-hidden /> {t('new')}
        </Button>
      </DialogTrigger>
      <DialogContent title={t('new')} closeLabel={tc('close')} className="max-w-3xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="iv-client" label={t('billTo')} hint={t('billToUser')}>
            <NativeSelect id="iv-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="iv-matter" label={t('matter')}>
            <NativeSelect id="iv-matter" value={matterId} onChange={(e) => setMatterId(e.target.value)}>
              <option value="">—</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <div className="mt-4 space-y-2">
          <div className="text-sm font-semibold">{t('lines')}</div>
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_80px_140px_auto]">
              <Input aria-label={t('description')} placeholder={t('description')} value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <Input aria-label={t('qty')} type="number" min={1} value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} />
              <Input aria-label={t('unitPrice')} type="number" min={0} value={l.unit} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unit: Number(e.target.value) } : x)))} />
              <Button variant="ghost" size="icon" aria-label={tc('remove')} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setLines([...lines, { description: '', quantity: 1, unit: 0 }])}>
            <Plus aria-hidden /> {t('addLine')}
          </Button>
          <div className="text-end font-bold">
            {tc('total')}: {formatMoney(totals.totalMinor, locale)}
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField id="iv-due" label={t('dueDate')}>
            <Input id="iv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
          <FormField id="iv-notes" label={t('notes')}>
            <Textarea id="iv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={!valid || pending} onClick={() => submit(false)}>
            {t('saveDraft')}
          </Button>
          <Button variant="gold" disabled={!valid} loading={pending} onClick={() => submit(true)}>
            {t('issue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function InvoiceStatusActions({ id, status }: { id: string; status: string }) {
  const t = useTranslations('dashboard.invoices')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  const act = (to: 'issued' | 'void' | 'paid') =>
    start(async () => {
      const res = await setInvoiceStatus(id, to)
      if (!res.ok) return void toast.error(terr(res.error))
      router.refresh()
    })
  return (
    <div className="flex gap-1">
      {status === 'draft' ? (
        <Button size="sm" variant="outline" loading={pending} onClick={() => act('issued')}>
          {t('issue')}
        </Button>
      ) : null}
      {status === 'issued' ? (
        <Button size="sm" variant="outline" loading={pending} onClick={() => act('paid')}>
          {t('markPaid')}
        </Button>
      ) : null}
      {status === 'draft' || status === 'issued' ? (
        <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => act('void')}>
          {t('void')}
        </Button>
      ) : null}
    </div>
  )
}
