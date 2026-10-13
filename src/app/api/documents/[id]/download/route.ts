import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbErrorResponse, jsonError } from '@/lib/http'
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Authorised download. The database decides (authorize_document_download runs
 * as the user and logs the access); only then is a 60-second signed URL issued.
 * Storage paths are never used as authorisation.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isServiceRoleConfigured()) return jsonError('notConfigured', 503)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return jsonError('notFound', 404)
  const url = new URL(req.url)
  const versionParam = url.searchParams.get('version')
  const version = versionParam ? Number(versionParam) : undefined
  const inline = url.searchParams.get('inline') === '1'

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return jsonError('unauthenticated', 401)

  const { data, error } = await supabase.rpc('authorize_document_download', { p_document_id: id, p_version: version })
  if (error || !data) return dbErrorResponse(error ?? {})
  const file = data as { bucket: string; path: string; filename: string }

  const { data: signed, error: signError } = await createAdminClient()
    .storage.from(file.bucket)
    .createSignedUrl(file.path, 60, inline ? undefined : { download: file.filename })
  if (signError || !signed) return jsonError('providerUnavailable', 502)
  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
