import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

const PRIVATE = ['/client', '/lawyer', '/firm', '/admin', '/consultation', '/checkout', '/dashboard', '/invitations', '/disputes', '/notifications', '/create-firm', '/invoices', '/book', '/api', '/auth']

export default function robots(): MetadataRoute.Robots {
  // Block indexing entirely outside production deployments.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return { rules: [{ userAgent: '*', disallow: '/' }] }
  const disallow = PRIVATE.flatMap((p) => [p, `/en${p}`])
  return { rules: [{ userAgent: '*', allow: '/', disallow }], sitemap: siteUrl('/sitemap.xml') }
}
