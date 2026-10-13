'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, fromDb, ok, validate, type ActionResult } from '@/lib/action'
import { createClient } from '@/lib/supabase/server'
import { egyptPhoneSchema } from '@/lib/validation'

const profileSchema = z.object({
  fullName: z.string().trim().min(3, 'tooShort').max(120, 'tooLong'),
  phone: z.union([egyptPhoneSchema, z.literal('')]),
  locale: z.enum(['ar', 'en']),
  governorateId: z.number().int().positive().nullable(),
})

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  const v = validate(profileSchema, input)
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: v.data.fullName, phone: v.data.phone || null, locale: v.data.locale, governorate_id: v.data.governorateId })
    .eq('id', auth.user.id)
  if (error) return fromDb(error)
  revalidatePath('/', 'layout')
  return ok()
}

const prefsSchema = z.array(z.object({ event: z.string().regex(/^(\*|[a-z_]+\.[a-z_]+)$/), channel: z.enum(['email', 'sms', 'whatsapp']), enabled: z.boolean() })).max(200)

export async function saveNotificationPreferences(prefs: z.input<typeof prefsSchema>): Promise<ActionResult> {
  const parsed = prefsSchema.safeParse(prefs)
  if (!parsed.success) return fail('required')
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  const rows = parsed.data.map((p) => ({ user_id: auth.user!.id, event_type: p.event, channel: p.channel, enabled: p.enabled, updated_at: new Date().toISOString() }))
  const { error } = await supabase.from('notification_preferences').upsert(rows, { onConflict: 'user_id,event_type,channel' })
  if (error) return fromDb(error)
  return ok()
}

export async function savePrivacy(input: { showName: boolean; aiEnabled: boolean; aiConsent: boolean; marketing: boolean }): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  const { data: current } = await supabase.from('user_settings').select('ai_document_consent_at').eq('user_id', auth.user.id).maybeSingle()
  const { error } = await supabase.from('user_settings').upsert({
    user_id: auth.user.id,
    allow_review_display_name: input.showName,
    ai_enabled: input.aiEnabled,
    ai_document_consent_at: input.aiConsent ? (current?.ai_document_consent_at ?? new Date().toISOString()) : null,
  })
  if (error) return fromDb(error)
  const { error: pErr } = await supabase.from('profiles').update({ marketing_consent: input.marketing }).eq('id', auth.user.id)
  if (pErr) return fromDb(pErr)
  return ok()
}

export async function requestDeletion(): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('request_account_deletion')
  if (error) return fromDb(error)
  return ok()
}

export async function cancelDeletion(): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_account_deletion')
  if (error) return fromDb(error)
  return ok()
}
