import { FileQuestion } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { Container } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

export default async function NotFound() {
  const t = await getTranslations('common')
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <Container className="flex flex-col items-center py-24 text-center">
          <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-gold-soft text-gold">
            <FileQuestion className="size-8" aria-hidden />
          </div>
          <p className="font-mono text-sm text-muted-foreground">404</p>
          <h1 className="mt-2 text-3xl font-bold">{t('notFoundTitle')}</h1>
          <p className="mt-3 max-w-md text-muted-foreground">{t('notFoundBody')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild variant="gold">
              <Link href="/">{t('goHome')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/lawyers">{t('search')}</Link>
            </Button>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  )
}
