'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, fromDb, ok, type ActionResult } from '@/lib/action'
import { createClient } from '@/lib/supabase/server'

export async function toggleFavorite(lawyerId: string): Promise<ActionResult<{ favorite: boolean }>> {
  if (!z.uuid().safeParse(lawyerId).success) return fail('notFound')
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  const { data: existing } = await supabase.from('lawyer_favorites').select('lawyer_id').eq('lawyer_id', lawyerId).eq('client_id', auth.user.id).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('lawyer_favorites').delete().eq('lawyer_id', lawyerId).eq('client_id', auth.user.id)
    if (error) return fromDb(error)
    revalidatePath('/client/favorites')
    return ok({ favorite: false })
  }
  const { error } = await supabase.from('lawyer_favorites').insert({ lawyer_id: lawyerId, client_id: auth.user.id })
  if (error) return fromDb(error)
  revalidatePath('/client/favorites')
  return ok({ favorite: true })
}

export async function isFavorite(lawyerId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return false
  const { data } = await supabase.from('lawyer_favorites').select('lawyer_id').eq('lawyer_id', lawyerId).eq('client_id', auth.user.id).maybeSingle()
  return Boolean(data)
}
