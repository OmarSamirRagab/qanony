import 'server-only'
import { unstable_cache } from 'next/cache'
import { isSupabaseConfigured } from '@/lib/env'
import { createPublicClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

export type Governorate = Tables<'governorates'>
export type City = Tables<'cities'>
export type Category = Tables<'legal_categories'>
export type ConsultationType = Tables<'consultation_types'>

const HOUR = 3600

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!isSupabaseConfigured) return fallback
  try {
    return await fn()
  } catch (error) {
    console.error('[reference]', error)
    return fallback
  }
}

export const getGovernorates = unstable_cache(
  () =>
    safe(async () => {
      const { data, error } = await createPublicClient().from('governorates').select('*').eq('is_active', true).order('sort_order')
      if (error) throw error
      return data
    }, [] as Governorate[]),
  ['governorates'],
  { revalidate: HOUR, tags: ['reference'] },
)

export const getCities = unstable_cache(
  () =>
    safe(async () => {
      const { data, error } = await createPublicClient().from('cities').select('*').eq('is_active', true).order('name_ar')
      if (error) throw error
      return data
    }, [] as City[]),
  ['cities'],
  { revalidate: HOUR, tags: ['reference'] },
)

export const getCategories = unstable_cache(
  () =>
    safe(async () => {
      const { data, error } = await createPublicClient().from('legal_categories').select('*').eq('is_active', true).order('sort_order')
      if (error) throw error
      return data
    }, [] as Category[]),
  ['categories'],
  { revalidate: HOUR, tags: ['reference', 'categories'] },
)

export const getConsultationTypes = unstable_cache(
  () =>
    safe(async () => {
      const { data, error } = await createPublicClient().from('consultation_types').select('*').eq('is_active', true).order('sort_order')
      if (error) throw error
      return data
    }, [] as ConsultationType[]),
  ['consultation-types'],
  { revalidate: HOUR, tags: ['reference'] },
)

export const getPublicSettings = unstable_cache(
  () =>
    safe(async () => {
      const { data, error } = await createPublicClient().from('platform_settings').select('key, value').eq('is_public', true)
      if (error) throw error
      return Object.fromEntries(data.map((r) => [r.key, r.value as Record<string, unknown>]))
    }, {} as Record<string, Record<string, unknown>>),
  ['public-settings'],
  { revalidate: 300, tags: ['settings'] },
)
