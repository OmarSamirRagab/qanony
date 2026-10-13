'use client'
import { getBrowserClient } from '@/lib/supabase/client'
import type { ErrorKey } from '@/lib/errors'
import type { Enums } from '@/types/database'

export interface UploadTarget {
  category: Enums<'document_category'>
  title?: string
  matterId?: string | null
  appointmentId?: string | null
  serviceOrderId?: string | null
  firmId?: string | null
  documentId?: string | null
  shareWithClient?: boolean
}

export type UploadResult = { ok: true; documentId: string; scan?: string } | { ok: false; error: ErrorKey }

/** Three-step secure upload: authorise + signed URL → direct upload → server-side verification. */
export async function uploadDocument(file: File, target: UploadTarget): Promise<UploadResult> {
  try {
    const init = await fetch('/api/documents/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: target.title || file.name,
        category: target.category,
        filename: file.name,
        mime: file.type,
        size: file.size,
        matterId: target.matterId,
        appointmentId: target.appointmentId,
        serviceOrderId: target.serviceOrderId,
        firmId: target.firmId,
        documentId: target.documentId,
        shareWithClient: target.shareWithClient,
      }),
    })
    const initBody = (await init.json()) as { ok: boolean; error?: ErrorKey; documentId: string; version: number; path: string; token: string; bucket: string }
    if (!init.ok || !initBody.ok) return { ok: false, error: initBody.error ?? 'unknown' }

    const { error } = await getBrowserClient().storage.from(initBody.bucket).uploadToSignedUrl(initBody.path, initBody.token, file, { contentType: file.type })
    if (error) return { ok: false, error: 'network' }

    const fin = await fetch(`/api/documents/${initBody.documentId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: initBody.version }),
    })
    const finBody = (await fin.json()) as { ok: boolean; error?: ErrorKey; scan?: string }
    if (!fin.ok || !finBody.ok) return { ok: false, error: finBody.error ?? 'unknown' }
    return { ok: true, documentId: initBody.documentId, scan: finBody.scan }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export function downloadUrl(documentId: string, version?: number) {
  return `/api/documents/${documentId}/download${version ? `?version=${version}` : ''}`
}
