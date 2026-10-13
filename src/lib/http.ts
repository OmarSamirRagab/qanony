import 'server-only'
import { NextResponse } from 'next/server'
import { mapDbError, type DbErrorLike, type ErrorKey } from '@/lib/errors'

/**
 * CSRF defence for cookie-authenticated JSON route handlers: require a
 * same-origin Origin (or Referer) header. Server Actions have this built in.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') ?? req.headers.get('referer')
  if (!origin) return false
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function jsonError(error: ErrorKey, status: number, detail?: string) {
  return NextResponse.json({ ok: false, error, detail }, { status, headers: { 'Cache-Control': 'no-store' } })
}

const STATUS: Partial<Record<ErrorKey, number>> = {
  unauthenticated: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  rateLimited: 429,
  invalidFile: 422,
  infected: 422,
}

export function dbErrorResponse(error: DbErrorLike) {
  const key = mapDbError(error)
  return jsonError(key, STATUS[key] ?? (error.code === '22023' ? 422 : 400), error.code === '22023' ? error.message : undefined)
}

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown').trim()
}
