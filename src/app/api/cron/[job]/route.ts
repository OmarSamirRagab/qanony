import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { JOBS, type JobName } from '@/lib/jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) return false
  const header = req.headers.get('authorization') ?? ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Scheduled job runner. Vercel Cron sends GET with `Authorization: Bearer
 * $CRON_SECRET`; any other scheduler can do the same. Jobs are idempotent.
 */
async function run(req: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: 'notConfigured' }, { status: 503 })
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  const { job } = await params
  if (!(job in JOBS)) return NextResponse.json({ ok: false, error: 'notFound' }, { status: 404 })
  const started = Date.now()
  try {
    const result = await JOBS[job as JobName]()
    return NextResponse.json({ ok: true, job, ms: Date.now() - started, result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error(`[cron] ${job} failed`, e)
    return NextResponse.json({ ok: false, job, error: 'failed' }, { status: 500 })
  }
}

export { run as GET, run as POST }
