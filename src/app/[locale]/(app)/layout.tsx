import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { toLocale } from '@/i18n/routing'

export const metadata: Metadata = { robots: { index: false, follow: false } }

// Per-user pages must never be prerendered or cached, even when Supabase is not configured at build time.
export const dynamic = 'force-dynamic'

/** Authenticated application area. Each portal layout enforces its own access. */
export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(toLocale(locale))
  return children
}
