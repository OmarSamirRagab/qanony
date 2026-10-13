import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/** Wordmark with a scales-of-justice monogram. */
export function Logo({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  const t = useTranslations('common')
  return (
    <Link href="/" className={cn('flex items-center gap-2.5 rounded-md', className)} aria-label={t('brand')}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-gold text-gold-foreground shadow-sm">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v18M7 21h10M4 7h16M6 7l-3 7a3 3 0 0 0 6 0L6 7Zm12 0-3 7a3 3 0 0 0 6 0l-3-7Z" />
        </svg>
      </span>
      <span className={cn('font-display text-2xl leading-none font-bold', onDark ? 'text-white' : 'text-primary dark:text-foreground')}>{t('brand')}</span>
    </Link>
  )
}
