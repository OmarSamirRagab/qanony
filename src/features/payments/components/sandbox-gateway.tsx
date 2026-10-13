'use client'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useRouter } from '@/i18n/navigation'
import { completeSandboxPayment } from '../actions'

export function SandboxGateway({ paymentId }: { paymentId: string }) {
  const t = useTranslations('payments.sandbox')
  const te = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  const act = (success: boolean) =>
    start(async () => {
      const res = await completeSandboxPayment(paymentId, success)
      if (!res.ok) {
        toast.error(te(res.error))
        return
      }
      router.push(`/checkout/result?payment=${paymentId}`)
    })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Button size="lg" variant="gold" loading={pending} onClick={() => act(true)} data-testid="sandbox-approve">
        <CheckCircle2 aria-hidden /> {t('approve')}
      </Button>
      <Button size="lg" variant="outline" disabled={pending} onClick={() => act(false)} data-testid="sandbox-decline">
        <XCircle aria-hidden /> {t('decline')}
      </Button>
    </div>
  )
}
