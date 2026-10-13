'use client'
import { Building2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'

export function FirmSwitcher({ firms, current }: { firms: { id: string; name: string }[]; current: string }) {
  const t = useTranslations('nav.firm')
  const router = useRouter()
  if (firms.length < 2) {
    return (
      <span className="flex items-center gap-2 truncate text-sm font-semibold">
        <Building2 className="size-4 shrink-0 text-gold" aria-hidden /> {firms[0]?.name}
      </span>
    )
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <Building2 className="size-4 shrink-0 text-gold" aria-hidden />
      <span className="sr-only">{t('selectFirm')}</span>
      <select
        className="h-9 max-w-60 cursor-pointer rounded-lg border border-input bg-card px-2 font-semibold"
        value={current}
        onChange={(e) => {
          document.cookie = `qanony_firm=${e.target.value}; path=/; max-age=31536000; samesite=lax`
          router.refresh()
        }}
      >
        {firms.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  )
}
