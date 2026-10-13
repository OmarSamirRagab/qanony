/**
 * Shared zod schemas. Messages are keys into messages/<locale>/errors.json so
 * the same schema validates on the server and renders localised errors in forms.
 */
import { z } from 'zod'

export const emailSchema = z.string().trim().toLowerCase().email('invalidEmail').max(254, 'invalidEmail')

/** Egyptian mobile numbers: 01[0125]XXXXXXXX, optionally with +20 / 0020 prefix. */
export const egyptPhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^0020/, '+20'))
  .refine((v) => /^(\+20|0)?1[0125]\d{8}$/.test(v), 'invalidPhone')
  .transform((v) => (v.startsWith('+20') ? v : `+20${v.replace(/^0/, '')}`))

export const passwordSchema = z
  .string()
  .min(10, 'passwordTooShort')
  .max(128, 'passwordTooShort')
  .refine((v) => /[A-Za-z؀-ۿ]/.test(v) && /\d/.test(v), 'passwordWeak')

export const registerSchema = z
  .object({
    accountType: z.enum(['client', 'lawyer']),
    fullName: z.string().trim().min(3, 'tooShort').max(120, 'tooLong'),
    nameEn: z.string().trim().max(120, 'tooLong').optional(),
    phone: egyptPhoneSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    terms: z.literal(true, { error: 'mustAcceptTerms' }),
    marketing: z.boolean().optional(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'passwordsDontMatch' })

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'required') })

export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
