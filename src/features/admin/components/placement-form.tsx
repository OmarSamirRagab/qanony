'use client'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label, Switch } from '@/components/ui/primitives'
import { useRouter } from '@/i18n/navigation'
import { setLawyerPlacement } from '../actions'

/** Editorial pick (never paid) and sponsored placement (always labelled publicly). */
export function PlacementForm({ lawyerId, featured, sponsoredUntil }: { lawyerId: string; featured: boolean; sponsoredUntil: string | null }) {
  const t = useTranslations('admin.verification')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [f, setF] = useState({ featured, until: sponsoredUntil?.slice(0, 10) ?? '' })
  const [pending, start] = useTransition()
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="pl-featured">{t('featured')}</Label>
        <Switch id="pl-featured" checked={f.featured} onCheckedChange={(v) => setF({ ...f, featured: v })} />
      </div>
      <FormField id="pl-until" label={t('sponsoredUntil')}>
        <Input id="pl-until" type="date" dir="ltr" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} />
      </FormField>
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await setLawyerPlacement(lawyerId, f.featured, f.until || null)
            if (!res.ok) return void toast.error(res.detail ?? terr(res.error))
            toast.success(tc('saved'))
            router.refresh()
          })
        }
      >
        {tc('save')}
      </Button>
    </div>
  )
}
