'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, fromDb, ok, type ActionResult } from '@/lib/action'
import { createClient } from '@/lib/supabase/server'
import type { Enums } from '@/types/database'

export async function createServiceOrder(serviceId: string, packageId: string | null, requirements: string): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ s: z.uuid(), p: z.uuid().nullable(), r: z.string().trim().max(5000) }).safeParse({ s: serviceId, p: packageId, r: requirements })
  if (!parsed.success) return fail('required')
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  const { data, error } = await supabase.rpc('create_service_order', { p_service_id: serviceId, p_package_id: packageId, p_requirements: parsed.data.r })
  if (error || !data) return fromDb(error ?? {})
  revalidatePath('/client/orders')
  return ok({ id: data })
}

export async function transitionServiceOrder(id: string, to: Enums<'service_order_status'>, note?: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return fail('notFound')
  const supabase = await createClient()
  const { error } = await supabase.rpc('transition_service_order', { p_order_id: id, p_to: to, p_note: note ?? null })
  if (error) return fromDb(error)
  revalidatePath(`/client/orders/${id}`)
  revalidatePath(`/lawyer/orders/${id}`)
  return ok()
}
