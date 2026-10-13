import type { MetadataRoute } from 'next'
import { isSupabaseConfigured, siteUrl } from '@/lib/env'
import { createPublicClient } from '@/lib/supabase/server'

export const revalidate = 3600

const STATIC = ['/', '/lawyers', '/services', '/categories', '/firms', '/articles', '/faq', '/about', '/contact', '/pricing', '/privacy', '/terms', '/refund-policy']

/** Arabic is served without a prefix; English under /en. Each entry lists both alternates. */
function entry(path: string, lastModified?: string | null, priority = 0.6): MetadataRoute.Sitemap[number] {
  const en = path === '/' ? '/en' : `/en${path}`
  return {
    url: siteUrl(path),
    lastModified: lastModified ? new Date(lastModified) : undefined,
    priority,
    alternates: { languages: { ar: siteUrl(path), en: siteUrl(en) } },
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items = STATIC.map((p) => entry(p, null, p === '/' ? 1 : 0.7))
  if (!isSupabaseConfigured) return items
  const db = createPublicClient()
  // Only public rows are readable with the anon key (RLS), so nothing private can leak here.
  const [lawyers, firms, articles, services, categories, governorates] = await Promise.all([
    db.from('lawyer_profiles').select('slug, updated_at').eq('is_published', true).eq('verification_status', 'verified').limit(5000),
    db.from('law_firms').select('slug, updated_at').eq('is_published', true).eq('verification_status', 'verified').limit(2000),
    db.from('legal_articles').select('slug, updated_at').eq('status', 'published').limit(2000),
    db.from('legal_services').select('slug, updated_at').eq('status', 'active').limit(5000),
    db.from('legal_categories').select('slug, updated_at').eq('is_active', true),
    db.from('governorates').select('code').eq('is_active', true),
  ])
  for (const l of lawyers.data ?? []) items.push(entry(`/lawyers/${l.slug}`, l.updated_at, 0.8))
  for (const f of firms.data ?? []) items.push(entry(`/firms/${f.slug}`, f.updated_at, 0.6))
  for (const a of articles.data ?? []) items.push(entry(`/articles/${a.slug}`, a.updated_at, 0.6))
  for (const s of services.data ?? []) items.push(entry(`/services/${s.slug}`, s.updated_at, 0.6))
  for (const c of categories.data ?? []) items.push(entry(`/categories/${c.slug}`, c.updated_at, 0.7))
  for (const g of governorates.data ?? []) items.push(entry(`/cities/${g.code.toLowerCase()}`, null, 0.5))
  return items
}
