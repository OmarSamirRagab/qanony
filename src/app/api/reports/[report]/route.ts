import { z } from 'zod'
import { jsonError } from '@/lib/http'
import { createClient } from '@/lib/supabase/server'

function csv(rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v)
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

/** CSV exports. Each report is computed by an RPC that authorises the caller. */
export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params
  const url = new URL(req.url)
  const range = z.object({ from: z.iso.date(), to: z.iso.date() }).safeParse({ from: url.searchParams.get('from'), to: url.searchParams.get('to') })
  if (!range.success) return jsonError('required', 422)
  const { from, to } = range.data
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return jsonError('unauthenticated', 401)

  let rows: (string | number | null)[][] = []
  if (report === 'lawyer') {
    const { data, error } = await supabase.rpc('lawyer_report', { p_from: from, p_to: to })
    if (error) return jsonError('forbidden', 403)
    const r = data as { bookings_by_day: { day: string; count: number }[]; revenue_by_type: { type: string; net_minor: number }[] }
    rows = [['section', 'key', 'value'], ...r.bookings_by_day.map((d) => ['bookings', d.day, d.count]), ...r.revenue_by_type.map((x) => ['net_revenue_egp', x.type, (x.net_minor / 100).toFixed(2)])]
  } else if (report === 'firm') {
    const firmId = z.uuid().safeParse(url.searchParams.get('firm'))
    if (!firmId.success) return jsonError('notFound', 404)
    const { data, error } = await supabase.rpc('firm_report', { p_firm_id: firmId.data, p_from: from, p_to: to })
    if (error) return jsonError('forbidden', 403)
    const r = data as { revenue_by_lawyer: { lawyer: string; gross_minor: number; net_minor: number }[] | null; workload: { name: string; open_tasks: number; matters: number }[] }
    rows = [
      ['section', 'name', 'value_1', 'value_2'],
      ...(r.revenue_by_lawyer ?? []).map((x) => ['revenue_egp', x.lawyer, (x.gross_minor / 100).toFixed(2), (x.net_minor / 100).toFixed(2)]),
      ...r.workload.map((w) => ['workload', w.name, w.open_tasks, w.matters]),
    ]
  } else if (report === 'admin') {
    const { data, error } = await supabase.rpc('admin_report', { p_from: from, p_to: to })
    if (error) return jsonError('forbidden', 403)
    const r = data as { revenue_by_day: { day: string; gross_minor: number; commission_minor: number }[]; signups_by_day: { day: string; clients: number; lawyers: number }[] }
    rows = [
      ['section', 'day', 'value_1', 'value_2'],
      ...r.revenue_by_day.map((d) => ['revenue_egp', d.day, (d.gross_minor / 100).toFixed(2), (d.commission_minor / 100).toFixed(2)]),
      ...r.signups_by_day.map((d) => ['signups', d.day, d.clients, d.lawyers]),
    ]
  } else {
    return jsonError('notFound', 404)
  }
  return new Response(csv(rows), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${report}-${from}-${to}.csv"`, 'Cache-Control': 'no-store' },
  })
}
