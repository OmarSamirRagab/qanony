'use client'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

/** Route-level error boundary. Never renders error details to users; the digest helps support correlate server logs. */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('common')
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-danger-soft text-destructive">
        <AlertTriangle className="size-8" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold">{t('somethingWrong')}</h1>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground" dir="ltr">
          ref: {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>{t('tryAgain')}</Button>
        <Button asChild variant="outline">
          <Link href="/">{t('goHome')}</Link>
        </Button>
      </div>
    </main>
  )
}
