import { z } from 'zod'
import type { LawyerSearchParams } from './queries'

const num = z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().finite().nonnegative().optional())
const str = z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : undefined), z.string().optional())

const schema = z.object({
  q: str,
  category: z.preprocess((v) => (typeof v === 'string' && /^[a-z0-9-]+$/.test(v) ? v : undefined), z.string().optional()),
  governorate: num,
  city: num,
  type: z.enum(['video', 'voice', 'text', 'in_person', 'written_opinion']).optional().catch(undefined),
  minPrice: num,
  maxPrice: num,
  minExperience: num,
  language: z.enum(['ar', 'en', 'fr', 'de']).optional().catch(undefined),
  minRating: num,
  firm: z.uuid().optional().catch(undefined),
  gender: z.enum(['male', 'female']).optional().catch(undefined),
  availableOn: z.preprocess((v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined), z.string().optional()),
  timeOfDay: z.enum(['morning', 'afternoon', 'evening']).optional().catch(undefined),
  online: z.preprocess((v) => v === '1' || v === 'true', z.boolean()),
  sort: z.enum(['relevance', 'soonest', 'price_asc', 'price_desc', 'experience', 'rating']).catch('relevance'),
  page: z.preprocess((v) => Math.max(1, Math.min(500, Number(v) || 1)), z.number()),
})

export function parseLawyerSearch(sp: Record<string, string | string[] | undefined>): LawyerSearchParams {
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))
  const parsed = schema.safeParse(flat)
  return parsed.success ? parsed.data : { sort: 'relevance', page: 1 }
}
