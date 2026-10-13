/** File validation shared by client (pre-checks) and server (authoritative). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
] as const

export const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt'

export function isAllowedFile(file: { type: string; size: number }): boolean {
  return (ALLOWED_MIME as readonly string[]).includes(file.type) && file.size > 0 && file.size <= MAX_UPLOAD_BYTES
}

/** Verifies the file's leading bytes match its declared type (defeats renamed executables). */
export function magicMatches(mime: string, bytes: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b)
  switch (mime) {
    case 'application/pdf':
      return starts(0x25, 0x50, 0x44, 0x46) // %PDF
    case 'image/png':
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    case 'image/jpeg':
      return starts(0xff, 0xd8, 0xff)
    case 'image/webp':
      return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return starts(0x50, 0x4b, 0x03, 0x04) // zip container
    case 'application/msword':
      return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1) // OLE2
    case 'text/plain':
      return !bytes.slice(0, 4096).includes(0)
    default:
      return false
  }
}

export function formatBytes(bytes: number, locale = 'ar'): string {
  const units = locale === 'ar' ? ['بايت', 'ك.ب', 'م.ب', 'ج.ب'] : ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
