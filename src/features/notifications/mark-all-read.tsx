'use client'
import { CheckCheck } from 'lucide-react'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from '@/i18n/navigation'
import { getBrowserClient } from '@/lib/supabase/client'

export function MarkAllReadButton({ label }: { label: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={() =>
        start(async () => {
          await getBrowserClient().rpc('mark_notifications_read', {})
          router.refresh()
        })
      }
    >
      <CheckCheck aria-hidden /> {label}
    </Button>
  )
}
