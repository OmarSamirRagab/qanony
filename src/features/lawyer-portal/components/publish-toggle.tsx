'use client'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useRouter } from '@/i18n/navigation'
import { setPublished } from '../actions'

export function PublishToggle({ published, verified }: { published: boolean; verified: boolean }) {
  const t = useTranslations('dashboard.lawyer')
  const te = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      variant={published ? 'outline' : 'gold'}
      disabled={!verified && !published}
      title={!verified ? t('publishRequiresVerification') : undefined}
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await setPublished(!published)
          if (!res.ok) return void toast.error(te(res.error))
          toast.success(!published ? t('published') : t('unpublished'))
          router.refresh()
        })
      }
    >
      {published ? <EyeOff aria-hidden /> : <Eye aria-hidden />} {published ? t('unpublish') : t('publish')}
    </Button>
  )
}
