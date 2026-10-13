'use client'
import { CreditCard } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { Enums } from '@/types/database'
import { startCheckout } from '../actions'

export function PayButton({ type, id, label, className }: { type: Enums<'payable_type'>; id: string; label: string; className?: string }) {
  const te = useTranslations('errors')
  const [pending, start] = useTransition()
  return (
    <Button
      variant="gold"
      size="lg"
      className={className}
      loading={pending}
      onClick={() =>
        start(async () => {
          // On success the action redirects to the gateway and never returns.
          const res = await startCheckout({ type, id })
          if (res && !res.ok) toast.error(res.detail ?? te(res.error))
        })
      }
    >
      <CreditCard aria-hidden /> {label}
    </Button>
  )
}
