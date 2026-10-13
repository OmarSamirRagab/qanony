'use server'
import { z } from 'zod'
import { fromDb, ok, validate, type ActionResult } from '@/lib/action'
import { createClient } from '@/lib/supabase/server'
import { emailSchema } from '@/lib/validation'

const contactSchema = z.object({
  name: z.string().trim().min(2, 'tooShort').max(120, 'tooLong'),
  email: emailSchema,
  phone: z.string().trim().max(20).optional(),
  subject: z.string().trim().min(3, 'tooShort').max(200, 'tooLong'),
  message: z.string().trim().min(10, 'tooShort').max(5000, 'tooLong'),
  website: z.string().max(0).optional(), // honeypot
})

export async function submitContact(input: z.input<typeof contactSchema>): Promise<ActionResult> {
  const v = validate(contactSchema, input)
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_contact_message', {
    p_name: v.data.name,
    p_email: v.data.email,
    p_phone: v.data.phone ?? '',
    p_subject: v.data.subject,
    p_message: v.data.message,
  })
  if (error) return fromDb(error)
  return ok()
}
