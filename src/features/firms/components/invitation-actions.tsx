'use client'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useRouter } from '@/i18n/navigation'
import { respondInvitation } from '../actions'

export function InvitationActions({ memberId }: { memberId: string }) {
  const t = useTranslations('firm.invitations')
  const te = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  const act = (accept: boolean) =>
    start(async () => {
      const res = await respondInvitation(memberId, accept)
      if (!res.ok) return void toast.error(res.detail ?? te(res.error))
      toast.success(accept ? t('accepted') : t('declined'))
      router.push(accept ? '/firm' : '/dashboard')
      router.refresh()
    })
  return (
    <div className="flex gap-2">
      <Button size="sm" loading={pending} onClick={() => act(true)}>
        {t('accept')}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(false)}>
        {t('decline')}
      </Button>
    </div>
  )
}
