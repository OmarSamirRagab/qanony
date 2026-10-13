'use client'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from '@/i18n/navigation'
import { setTicketStatus } from '../actions'

export function TicketStaffControls({ id, status }: { id: string; status: string }) {
  const te = useTranslations('enums.ticket')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <select
      className="h-9 cursor-pointer rounded-lg border border-input bg-card px-2 text-sm"
      value={status}
      disabled={pending}
      aria-label="status"
      onChange={(e) =>
        start(async () => {
          const res = await setTicketStatus(id, e.target.value as 'open', true)
          if (!res.ok) toast.error(terr(res.error))
          router.refresh()
        })
      }
    >
      {(['open', 'pending', 'resolved', 'closed'] as const).map((s) => (
        <option key={s} value={s}>
          {te(s)}
        </option>
      ))}
    </select>
  )
}
