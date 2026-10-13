'use client'
import { MessagesSquare } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useRouter } from '@/i18n/navigation'
import { openMatterConversation } from '../actions'

export function OpenMatterChatButton({ matterId, portal, label }: { matterId: string; portal: 'client' | 'lawyer'; label: string }) {
  const te = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await openMatterConversation(matterId)
          if (!res.ok) return void toast.error(te(res.error))
          router.push(`/${portal}/messages/${res.data.id}`)
        })
      }
    >
      <MessagesSquare aria-hidden /> {label}
    </Button>
  )
}
