'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, fromDb, ok, type ActionResult } from '@/lib/action'
import { createClient } from '@/lib/supabase/server'

export async function addAppointmentNote(appointmentId: string, body: string, shared: boolean): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid(), body: z.string().trim().min(1).max(20000) }).safeParse({ id: appointmentId, body })
  if (!parsed.success) return fail('required')
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  const { error } = await supabase.from('appointment_notes').insert({ appointment_id: appointmentId, author_id: auth.user.id, body: parsed.data.body, shared_with_client: shared })
  if (error) return fromDb(error)
  revalidatePath(`/lawyer/appointments/${appointmentId}`)
  return ok()
}

export async function deleteAppointmentNote(noteId: string, appointmentId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('appointment_notes').delete().eq('id', noteId)
  if (error) return fromDb(error)
  revalidatePath(`/lawyer/appointments/${appointmentId}`)
  return ok()
}
