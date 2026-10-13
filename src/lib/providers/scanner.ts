import 'server-only'

export type ScanResult = 'clean' | 'infected' | 'unscanned' | 'error'

/**
 * Malware scanning adapter. Supports a self-hosted ClamAV REST endpoint
 * (e.g. clamav-rest) at CLAMAV_SCAN_URL that accepts multipart "file" and
 * returns JSON containing `infected` (boolean) or a `status` field.
 *
 * Confidential legal documents must never be sent to public multi-tenant
 * scanning services; keep the scanner inside your own infrastructure.
 * Without configuration files are stored as 'unscanned' (shown to users).
 */
export function isScannerConfigured() {
  return Boolean(process.env.CLAMAV_SCAN_URL)
}

export async function scanFile(bytes: Uint8Array, filename: string): Promise<ScanResult> {
  const url = process.env.CLAMAV_SCAN_URL
  if (!url) return 'unscanned'
  try {
    const form = new FormData()
    form.append('file', new Blob([bytes as BlobPart]), filename)
    const res = await fetch(url, {
      method: 'POST',
      body: form,
      headers: process.env.CLAMAV_SCAN_TOKEN ? { Authorization: `Bearer ${process.env.CLAMAV_SCAN_TOKEN}` } : undefined,
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return 'error'
    const body = (await res.json()) as { infected?: boolean; status?: string; Status?: string }
    if (typeof body.infected === 'boolean') return body.infected ? 'infected' : 'clean'
    const status = (body.status ?? body.Status ?? '').toUpperCase()
    if (status === 'FOUND' || status === 'INFECTED') return 'infected'
    if (status === 'OK' || status === 'CLEAN') return 'clean'
    return 'error'
  } catch (error) {
    console.error('[scanner]', error)
    return 'error'
  }
}
