import type { Metadata, Viewport } from 'next'
import { Amiri, Cairo } from 'next/font/google'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Providers } from '@/components/providers'
import { dirFor, routing } from '@/i18n/routing'
import { publicEnv } from '@/lib/env'
import '../globals.css'

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' })
const amiri = Amiri({ subsets: ['arabic', 'latin'], weight: ['400', '700'], variable: '--font-amiri', display: 'swap' })

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: hasLocale(routing.locales, locale) ? locale : 'ar', namespace: 'home.meta' })
  return {
    metadataBase: new URL(publicEnv.siteUrl),
    title: { default: t('title'), template: `%s | ${t('brand')}` },
    description: t('description'),
    applicationName: t('brand'),
    openGraph: { type: 'website', siteName: t('brand'), locale: locale === 'ar' ? 'ar_EG' : 'en_US' },
    twitter: { card: 'summary_large_image' },
    alternates: { canonical: locale === 'ar' ? '/' : '/en', languages: { ar: '/', en: '/en' } },
    formatDetection: { telephone: false },
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f2847' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1220' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('common')

  return (
    <html lang={locale} dir={dirFor(locale)} className={`${cairo.variable} ${amiri.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only z-[100] rounded-md bg-gold px-4 py-2 font-semibold text-gold-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>
          <Providers dir={dirFor(locale)}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
