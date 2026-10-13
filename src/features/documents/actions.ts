'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, fromDb, ok, type ActionResult } from '@/lib/action'
import { createClient } from '@/lib/supabase/server'

export async function deleteDocument(documentId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(documentId).success) return fail('notFound')
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_document', { p_document_id: documentId })
  if (error) return fromDb(error)
  revalidatePath('/client/documents')
  revalidatePath('/lawyer/documents')
  return ok()
}

export async function setDocumentAiAllowed(documentId: string, allowed: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('documents').update({ ai_processing_allowed: allowed }).eq('id', documentId).select('id')
  if (error) return fromDb(error)
  if (!data?.length) return fail('forbidden')
  return ok()
}

/** Shares a document with a user the owner already works with (profile must be visible to them). */
export async function shareDocument(documentId: string, granteeId: string, permission: 'view' | 'edit', expiresAt: string | null): Promise<ActionResult> {
  const parsed = z.object({ d: z.uuid(), g: z.uuid() }).safeParse({ d: documentId, g: granteeId })
  if (!parsed.success) return fail('notFound')
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  const { data: visible } = await supabase.from('profiles').select('id').eq('id', granteeId).maybeSingle()
  if (!visible) return fail('forbidden')
  const { error } = await supabase
    .from('document_access_grants')
    .upsert({ document_id: documentId, grantee_id: granteeId, permission, granted_by: auth.user.id, expires_at: expiresAt }, { onConflict: 'document_id,grantee_id' })
  if (error) return fromDb(error)
  return ok()
}

export async function revokeShare(grantId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('document_access_grants').delete().eq('id', grantId)
  if (error) return fromDb(error)
  return ok()
}
