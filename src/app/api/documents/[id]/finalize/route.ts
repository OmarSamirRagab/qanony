import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isSameOrigin, jsonError } from '@/lib/http'
import { magicMatches, MAX_UPLOAD_BYTES } from '@/lib/files'
import { scanFile } from '@/lib/providers/scanner'
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Step 2 of an upload: verify the object really exists, matches its declared
 * type by magic bytes, hash it, scan it, then activate the document version.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return jsonError('forbidden', 403)
  if (!isServiceRoleConfigured()) return jsonError('notConfigured', 503)
  const { id } = await params
  const body = z.object({ version: z.number().int().positive() }).safeParse(await req.json().catch(() => null))
  if (!z.uuid().safeParse(id).success || !body.success) return jsonError('notFound', 404)

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return jsonError('unauthenticated', 401)

  // The uploader must be able to see this pending version through RLS.
  const { data: version } = await supabase
    .from('document_versions')
    .select('storage_bucket, storage_path, mime_type, original_filename, uploaded_by, uploaded_at')
    .eq('document_id', id)
    .eq('version', body.data.version)
    .maybeSingle()
  if (!version || version.uploaded_by !== auth.user.id) return jsonError('notFound', 404)
  if (version.uploaded_at) return NextResponse.json({ ok: true, already: true })

  const admin = createAdminClient()
  const { data: blob, error } = await admin.storage.from(version.storage_bucket).download(version.storage_path)
  if (error || !blob) return jsonError('notFound', 404)
  const bytes = new Uint8Array(await blob.arrayBuffer())

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES || !magicMatches(version.mime_type, bytes)) {
    // Remove the object; the version stays un-uploaded and the cleanup job purges it.
    await admin.storage.from(version.storage_bucket).remove([version.storage_path])
    return jsonError('invalidFile', 422)
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const scan = await scanFile(bytes, version.original_filename)
  if (scan === 'infected') {
    await admin.storage.from(version.storage_bucket).remove([version.storage_path])
  }
  const { error: markError } = await admin.rpc('mark_document_uploaded', {
    p_document_id: id,
    p_version: body.data.version,
    p_size: bytes.byteLength,
    p_sha256: sha256,
    p_scan: scan,
  })
  if (markError) return jsonError('unknown', 500)
  if (scan === 'infected') return jsonError('infected', 422)
  return NextResponse.json({ ok: true, scan })
}
