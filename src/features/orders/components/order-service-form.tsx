'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Link, useRouter } from '@/i18n/navigation'
import { formatMoney } from '@/lib/domain/money'
import { cn } from '@/lib/utils'
import { createServiceOrder } from '../actions'

export function OrderServiceForm({
  serviceId,
  basePrice,
  baseDays,
  packages,
  signedIn,
  slug,
}: {
  serviceId: string
  basePrice: number
  baseDays: number
  packages: { id: string; name: string; price_minor: number; estimated_days: number }[]
  signedIn: boolean
  slug: string
}) {
  const t = useTranslations('content.services')
  const te = useTranslations('errors')
  const locale = useLocale()
  const router = useRouter()
  const [pkg, setPkg] = useState<string | null>(null)
  const [req, setReq] = useState('')
  const [pending, start] = useTransition()
  const options = [{ id: null as string | null, name: t('basePackage'), price_minor: basePrice, estimated_days: baseDays }, ...packages]
  return (
    <div className="space-y-4">
      {packages.length ? (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">{t('packages')}</legend>
          {options.map((o) => (
            <button
              key={o.id ?? 'base'}
              type="button"
              onClick={() => setPkg(o.id)}
              aria-pressed={pkg === o.id}
              className={cn('flex w-full cursor-pointer items-center justify-between rounded-xl border p-3 text-start text-sm', pkg === o.id && 'border-gold bg-gold-soft/50')}
            >
              <span>
                <span className="font-semibold">{o.name}</span>
                <span className="block text-xs text-muted-foreground">{t('days', { count: o.estimated_days })}</span>
              </span>
              <span className="font-bold">{formatMoney(o.price_minor, locale)}</span>
            </button>
          ))}
        </fieldset>
      ) : null}
      <FormField id="req" label={t('requirements')} hint={t('requirementsHint')}>
        <Textarea id="req" rows={4} value={req} onChange={(e) => setReq(e.target.value)} maxLength={5000} />
      </FormField>
      {signedIn ? (
        <Button
          variant="gold"
          size="lg"
          className="w-full"
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await createServiceOrder(serviceId, pkg, req)
              if (!res.ok) return void toast.error(res.detail ?? te(res.error))
              router.push(`/checkout/service_order/${res.data.id}`)
            })
          }
        >
          {t('order')}
        </Button>
      ) : (
        <Button asChild variant="gold" size="lg" className="w-full">
          <Link href={`/login?next=${encodeURIComponent(`/services/${slug}`)}`}>{t('order')}</Link>
        </Button>
      )}
    </div>
  )
}
