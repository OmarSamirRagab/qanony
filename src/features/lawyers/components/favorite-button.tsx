'use client'
import { Heart } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useRouter } from '@/i18n/navigation'
import { isSupabaseConfigured } from '@/lib/env'
import { getBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { toggleFavorite } from '../actions'

export function FavoriteButton({ lawyerId }: { lawyerId: string }) {
  const t = useTranslations('lawyers.profile')
  const te = useTranslations('errors')
  const router = useRouter()
  const [fav, setFav] = useState(false)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const supabase = getBrowserClient()
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: row } = await supabase.from('lawyer_favorites').select('lawyer_id').eq('lawyer_id', lawyerId).maybeSingle()
      setFav(Boolean(row))
    })
  }, [lawyerId])

  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      aria-pressed={fav}
      onClick={() =>
        start(async () => {
          const res = await toggleFavorite(lawyerId)
          if (res.ok) setFav(res.data.favorite)
          else if (res.error === 'unauthenticated') router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)
          else toast.error(te(res.error))
        })
      }
    >
      <Heart className={cn(fav && 'fill-destructive text-destructive')} aria-hidden />
      {fav ? t('unfavorite') : t('favorite')}
    </Button>
  )
}
