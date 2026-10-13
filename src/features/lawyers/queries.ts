import 'server-only'
import { unstable_cache } from 'next/cache'
import { isSupabaseConfigured } from '@/lib/env'
import { createPublicClient } from '@/lib/supabase/server'
import type { Database, Enums } from '@/types/database'

export type LawyerSearchRow = Omit<Database['public']['Functions']['search_lawyers']['Returns'][number], 'specializations'> & {
  specializations: { slug: string; name_ar: string; name_en: string }[]
}

export interface LawyerSearchParams {
  q?: string
  category?: string
  governorate?: number
  city?: number
  type?: Enums<'consultation_kind'>
  minPrice?: number
  maxPrice?: number
  minExperience?: number
  language?: string
  minRating?: number
  firm?: string
  gender?: 'male' | 'female'
  availableOn?: string
  timeOfDay?: 'morning' | 'afternoon' | 'evening'
  online?: boolean
  sort?: 'relevance' | 'soonest' | 'price_asc' | 'price_desc' | 'experience' | 'rating'
  page?: number
  pageSize?: number
}

export async function searchLawyers(p: LawyerSearchParams): Promise<{ rows: LawyerSearchRow[]; total: number }> {
  if (!isSupabaseConfigured) return { rows: [], total: 0 }
  const pageSize = p.pageSize ?? 12
  const { data, error } = await createPublicClient().rpc('search_lawyers', {
    p_query: p.q || undefined,
    p_category_slug: p.category || undefined,
    p_governorate_id: p.governorate || undefined,
    p_city_id: p.city || undefined,
    p_consultation_type: p.type || undefined,
    p_min_price_minor: p.minPrice != null ? p.minPrice * 100 : undefined,
    p_max_price_minor: p.maxPrice != null ? p.maxPrice * 100 : undefined,
    p_min_experience: p.minExperience || undefined,
    p_language: p.language || undefined,
    p_min_rating: p.minRating || undefined,
    p_firm_id: p.firm || undefined,
    p_gender: p.gender || undefined,
    p_available_on: p.availableOn || undefined,
    p_time_of_day: p.timeOfDay || undefined,
    p_online_only: p.online ?? false,
    p_sort: p.sort ?? 'relevance',
    p_limit: pageSize,
    p_offset: ((p.page ?? 1) - 1) * pageSize,
  })
  if (error) {
    console.error('[searchLawyers]', error)
    return { rows: [], total: 0 }
  }
  const rows = (data ?? []) as LawyerSearchRow[]
  return { rows, total: Number(rows[0]?.total_count ?? 0) }
}

export const getFeaturedLawyers = unstable_cache(
  async (): Promise<LawyerSearchRow[]> => {
    if (!isSupabaseConfigured) return []
    const { data, error } = await createPublicClient().rpc('search_lawyers', { p_sort: 'relevance', p_limit: 8 })
    if (error) return []
    return (data ?? []) as LawyerSearchRow[]
  },
  ['featured-lawyers'],
  { revalidate: 300, tags: ['lawyers'] },
)

/** Paid placements are fetched separately and always labelled "Sponsored". */
export const getSponsoredLawyers = unstable_cache(
  async (): Promise<{ id: string; slug: string; display_name_ar: string; display_name_en: string | null; title_ar: string | null; title_en: string | null; photo_url: string | null }[]> => {
    if (!isSupabaseConfigured) return []
    const { data } = await createPublicClient()
      .from('lawyer_profiles')
      .select('id, slug, display_name_ar, display_name_en, title_ar, title_en, photo_url')
      .gt('sponsored_until', new Date().toISOString())
      .limit(3)
    return data ?? []
  },
  ['sponsored-lawyers'],
  { revalidate: 300, tags: ['lawyers'] },
)

export async function getLawyerBySlug(slug: string) {
  if (!isSupabaseConfigured) return null
  const supabase = createPublicClient()
  const { data: lawyer } = await supabase
    .from('lawyer_profiles')
    .select('*, governorate:governorates(name_ar, name_en), city:cities(name_ar, name_en), firm:law_firms!lawyer_profiles_primary_firm_id_fkey(id, slug, name_ar, name_en, logo_url)')
    .eq('slug', slug)
    .maybeSingle()
  if (!lawyer) return null
  const [specs, offerings, offices, credentials, reviews, services] = await Promise.all([
    supabase.from('lawyer_specializations').select('is_primary, category:legal_categories(id, slug, name_ar, name_en)').eq('lawyer_id', lawyer.id),
    supabase.from('lawyer_consultation_offerings').select('consultation_type, price_minor, duration_minutes').eq('lawyer_id', lawyer.id).eq('is_active', true),
    supabase.from('lawyer_offices').select('id, label, address_ar, address_en, map_url').eq('lawyer_id', lawyer.id).eq('is_active', true),
    supabase.from('lawyer_credentials').select('id, kind, title, issuer, issued_on').eq('lawyer_id', lawyer.id),
    supabase
      .from('reviews')
      .select('id, rating, comment, display_name, lawyer_response, published_at, appointment_id, service_order_id')
      .eq('lawyer_id', lawyer.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(20),
    supabase.from('legal_services').select('id, slug, title_ar, title_en, price_minor, estimated_days').eq('lawyer_id', lawyer.id).eq('status', 'active').limit(6),
  ])
  return {
    lawyer,
    specializations: (specs.data ?? []).flatMap((s) => (s.category ? [{ ...s.category, is_primary: s.is_primary }] : [])),
    offerings: offerings.data ?? [],
    offices: offices.data ?? [],
    credentials: credentials.data ?? [],
    reviews: reviews.data ?? [],
    services: services.data ?? [],
  }
}

export type LawyerProfileData = NonNullable<Awaited<ReturnType<typeof getLawyerBySlug>>>

export async function getAvailableSlots(lawyerId: string, type: Enums<'consultation_kind'>, from: string, to: string) {
  if (!isSupabaseConfigured) return []
  const { data, error } = await createPublicClient().rpc('get_available_slots', {
    p_lawyer_id: lawyerId,
    p_consultation_type: type,
    p_from: from,
    p_to: to,
  })
  if (error) {
    console.error('[slots]', error)
    return []
  }
  return data ?? []
}
