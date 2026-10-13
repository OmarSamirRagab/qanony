import 'server-only'
import { unstable_cache } from 'next/cache'
import { isSupabaseConfigured } from '@/lib/env'
import { createPublicClient } from '@/lib/supabase/server'

export const getArticles = unstable_cache(
  async (limit = 50) => {
    if (!isSupabaseConfigured) return []
    const { data } = await createPublicClient()
      .from('legal_articles')
      .select('id, slug, kind, title_ar, title_en, excerpt_ar, excerpt_en, cover_image_url, published_at, reading_minutes, category:legal_categories(slug, name_ar, name_en)')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit)
    return data ?? []
  },
  ['articles'],
  { revalidate: 300, tags: ['content'] },
)

export async function getArticle(slug: string) {
  if (!isSupabaseConfigured) return null
  const { data } = await createPublicClient()
    .from('legal_articles')
    .select('*, category:legal_categories(slug, name_ar, name_en), author:lawyer_profiles(slug, display_name_ar, display_name_en)')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return data
}

export const getFaqs = unstable_cache(
  async () => {
    if (!isSupabaseConfigured) return []
    const { data } = await createPublicClient().from('faqs').select('*').eq('is_published', true).order('sort_order')
    return data ?? []
  },
  ['faqs'],
  { revalidate: 300, tags: ['content'] },
)

export async function getCmsPage(slug: string) {
  if (!isSupabaseConfigured) return null
  const { data } = await createPublicClient().from('cms_pages').select('*').eq('slug', slug).eq('status', 'published').maybeSingle()
  return data
}

export const getPlans = unstable_cache(
  async () => {
    if (!isSupabaseConfigured) return []
    const { data } = await createPublicClient()
      .from('subscription_plans')
      .select('*, features:plan_features(feature_key, enabled, limit_value)')
      .eq('is_active', true)
      .eq('is_public', true)
      .order('sort_order')
    return data ?? []
  },
  ['plans'],
  { revalidate: 300, tags: ['plans'] },
)

export async function getPublicFirms(params: { q?: string; governorate?: number; page?: number; pageSize?: number } = {}) {
  if (!isSupabaseConfigured) return { rows: [], total: 0 }
  const pageSize = params.pageSize ?? 12
  const page = params.page ?? 1
  let query = createPublicClient()
    .from('law_firms')
    .select('id, slug, name_ar, name_en, description_ar, description_en, logo_url, founded_year, governorate:governorates(name_ar, name_en)', { count: 'exact' })
    .eq('is_published', true)
    .eq('verification_status', 'verified')
  if (params.q) query = query.or(`name_ar.ilike.%${params.q.replace(/[%,()]/g, '')}%,name_en.ilike.%${params.q.replace(/[%,()]/g, '')}%`)
  if (params.governorate) query = query.eq('governorate_id', params.governorate)
  const { data, count } = await query.order('name_ar').range((page - 1) * pageSize, page * pageSize - 1)
  return { rows: data ?? [], total: count ?? 0 }
}

export async function getFirmBySlug(slug: string) {
  if (!isSupabaseConfigured) return null
  const supabase = createPublicClient()
  const { data: firm } = await supabase
    .from('law_firms')
    .select('*, governorate:governorates(name_ar, name_en), city:cities(name_ar, name_en)')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()
  if (!firm) return null
  const [branches, lawyers] = await Promise.all([
    supabase.from('law_firm_branches').select('id, name_ar, name_en, address_ar, address_en, phone, is_headquarters').eq('firm_id', firm.id).eq('is_active', true),
    supabase.rpc('search_lawyers', { p_firm_id: firm.id, p_limit: 24 }),
  ])
  return { firm, branches: branches.data ?? [], lawyers: lawyers.data ?? [] }
}

export async function getPublicServices(params: { q?: string; category?: string; page?: number; pageSize?: number } = {}) {
  if (!isSupabaseConfigured) return { rows: [], total: 0 }
  const pageSize = params.pageSize ?? 12
  const page = params.page ?? 1
  const supabase = createPublicClient()
  let categoryId: string | undefined
  if (params.category) {
    const { data } = await supabase.from('legal_categories').select('id').eq('slug', params.category).maybeSingle()
    if (!data) return { rows: [], total: 0 }
    categoryId = data.id
  }
  let query = supabase
    .from('legal_services')
    .select('id, slug, title_ar, title_en, description_ar, description_en, price_minor, estimated_days, category:legal_categories(slug, name_ar, name_en), lawyer:lawyer_profiles(slug, display_name_ar, display_name_en, photo_url, rating_avg, rating_count)', { count: 'exact' })
    .eq('status', 'active')
  if (categoryId) query = query.eq('category_id', categoryId)
  if (params.q) query = query.or(`title_ar.ilike.%${params.q.replace(/[%,()]/g, '')}%,title_en.ilike.%${params.q.replace(/[%,()]/g, '')}%`)
  const { data, count } = await query.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  return { rows: data ?? [], total: count ?? 0 }
}

export async function getServiceBySlug(slug: string) {
  if (!isSupabaseConfigured) return null
  const { data } = await createPublicClient()
    .from('legal_services')
    .select('*, category:legal_categories(slug, name_ar, name_en), lawyer:lawyer_profiles(id, slug, display_name_ar, display_name_en, title_ar, title_en, photo_url, rating_avg, rating_count, years_experience), packages:service_packages(id, name_ar, name_en, price_minor, estimated_days, deliverables, sort_order, is_active)')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()
  return data
}
