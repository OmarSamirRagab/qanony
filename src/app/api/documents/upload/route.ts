import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbErrorResponse, isSameOrigin, jsonError } from '@/lib/http'
import { isAllowedFile } from '@/lib/files'
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.enum(['contract', 'identity', 'legal_notice', 'case_document', 'court_submission', 'evidence', 'legal_opinion', 'agreement', 'invoice', 'power_of_attorney', 'credential', 'deliverable', 'other']),
  filename: z.string().trim().min(1).max(200),
  mime: z.string().max(120),
  size: z.number().int().positive(),
  matterId: z.uuid().nullish(),
  appointmentId: z.uuid().nullish(),
  serviceOrderId: z.uuid().nullish(),
  firmId: z.uuid().nullish(),
  documentId: z.uuid().nullish(),
  shareWithClient: z.boolean().optional(),
})

/**
 * Step 1 of an upload. Authorisation and row creation happen in the database
 * (create_document_upload, as the user). Only then do we mint a signed upload
 * URL for exactly that object path.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError('forbidden', 403)
  if (!isServiceRoleConfigured()) return jsonError('notConfigured', 503)
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('invalidFile', 422)
  const input = parsed.data
  if (!isAllowedFile({ type: input.mime, size: input.size })) return jsonError('invalidFile', 422)

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return jsonError('unauthenticated', 401)

  const { data, error } = await supabase.rpc('create_document_upload', {
    p_title: input.title,
    p_category: input.category,
    p_filename: input.filename,
    p_mime: input.mime,
    p_size: input.size,
    p_matter_id: input.matterId ?? undefined,
    p_appointment_id: input.appointmentId ?? undefined,
    p_service_order_id: input.serviceOrderId ?? undefined,
    p_firm_id: input.firmId ?? undefined,
    p_document_id: input.documentId ?? undefined,
    p_share_with_client: input.shareWithClient ?? false,
  })
  if (error || !data) return dbErrorResponse(error ?? {})
  const row = data as { document_id: string; version: number; storage_path: string; bucket: string }

  const { data: signed, error: signError } = await createAdminClient().storage.from(row.bucket).createSignedUploadUrl(row.storage_path)
  if (signError || !signed) {
    console.error('[upload] sign failed', signError)
    return jsonError('providerUnavailable', 502)
  }
  return NextResponse.json({ ok: true, documentId: row.document_id, version: row.version, path: row.storage_path, token: signed.token, bucket: row.bucket })
}
