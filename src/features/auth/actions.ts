'use server'
import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { fail, fromDb, ok, validate, type ActionResult } from '@/lib/action'
import { siteUrl } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import { emailSchema, passwordSchema, registerSchema } from '@/lib/validation'

export async function register(input: z.input<typeof registerSchema>): Promise<ActionResult<{ email: string; needsConfirmation: boolean }>> {
  const v = validate(registerSchema, input)
  if ('result' in v) return v.result
  const locale = await getLocale()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: v.data.email,
    password: v.data.password,
    options: {
      emailRedirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(v.data.accountType === 'lawyer' ? '/lawyer/profile' : '/client')}`),
      data: {
        account_type: v.data.accountType,
        full_name: v.data.fullName,
        name_en: v.data.nameEn ?? '',
        phone: v.data.phone,
        locale,
        terms_accepted: true,
        marketing_consent: v.data.marketing ?? false,
      },
    },
  })
  if (error) return fromDb({ message: error.message, status: error.status })
  // Supabase returns a user with no identities when the email already exists (to prevent enumeration we show the same message).
  return ok({ email: v.data.email, needsConfirmation: !data.session })
}

export async function requestPasswordReset(email: string): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return fail('required')
  const supabase = await createClient()
  // Always report success to avoid account enumeration.
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: siteUrl('/auth/callback?next=/reset-password') })
  return ok()
}

export async function updatePassword(password: string): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(password)
  if (!parsed.success) return { ok: false, error: 'required', fieldErrors: { password: parsed.error.issues[0]?.message ?? 'passwordWeak' } }
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  const { error } = await supabase.auth.updateUser({ password: parsed.data })
  if (error) return fromDb({ message: error.message, status: error.status })
  return ok()
}

export async function sendMagicLink(email: string, next?: string): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return fail('required')
  const supabase = await createClient()
  await supabase.auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: false, emailRedirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(next ?? '/dashboard')}`) } })
  return ok()
}
