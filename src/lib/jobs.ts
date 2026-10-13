import 'server-only'
import { getProvider } from '@/lib/providers/payments'
import { CHANNELS, toE164 } from '@/lib/providers/notify'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Scheduled background jobs. Each job is idempotent and safe to run
 * concurrently: the database claims work with FOR UPDATE SKIP LOCKED and all
 * state transitions are guarded in SQL. Invoked by /api/cron/[job] with the
 * CRON_SECRET bearer token (see vercel.json for the schedule).
 */

export type JobResult = Record<string, number | string>

async function countRpc(fn: 'expire_stale_appointments' | 'queue_reminders' | 'auto_complete_delivered_orders' | 'process_subscription_renewals'): Promise<JobResult> {
  const { data, error } = await createAdminClient().rpc(fn)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return { processed: Number(data ?? 0) }
}

export async function deliverNotifications(limit = 50): Promise<JobResult> {
  const db = createAdminClient()
  const { data: rows, error } = await db.rpc('claim_notification_deliveries', { p_limit: limit })
  if (error) throw new Error(`claim_notification_deliveries: ${error.message}`)
  const result = { sent: 0, skipped: 0, failed: 0 }
  for (const row of rows ?? []) {
    const adapter = CHANNELS[row.channel as keyof typeof CHANNELS]
    const to = row.channel === 'email' ? row.email : toE164(row.phone)
    let status: 'sent' | 'skipped' | 'failed'
    let provider = adapter?.provider ?? row.channel
    let messageId: string | null = null
    let err: string | null = null
    if (!adapter || !adapter.configured()) {
      status = 'skipped'
      err = 'channel not configured'
    } else if (!to) {
      status = 'skipped'
      err = 'no valid recipient'
    } else {
      try {
        const res = await adapter.send({ to, locale: row.locale, title: row.title, body: row.body, link: row.link })
        provider = res.provider
        if (res.ok) {
          status = 'sent'
          messageId = res.messageId
        } else {
          // Permanent provider rejections are not retried.
          status = res.retryable ? 'failed' : 'skipped'
          err = res.error
        }
      } catch (e) {
        status = 'failed'
        err = e instanceof Error ? e.message : 'send error'
      }
    }
    const { error: ce } = await db.rpc('complete_notification_delivery', { p_delivery_id: row.delivery_id, p_status: status, p_provider: provider, p_message_id: messageId, p_error: err })
    if (ce) console.error('[jobs] complete_notification_delivery', ce.message)
    result[status]++
  }
  return result
}

export async function processRefunds(limit = 10): Promise<JobResult> {
  const db = createAdminClient()
  const { data: refunds, error } = await db.rpc('claim_refunds', { p_limit: limit })
  if (error) throw new Error(`claim_refunds: ${error.message}`)
  const result = { succeeded: 0, failed: 0 }
  for (const r of refunds ?? []) {
    const { data: p } = await db.from('payments').select('provider, provider_transaction_id').eq('id', r.payment_id).single()
    const provider = p ? getProvider(p.provider) : null
    let ok = false
    let providerRefundId: string | null = null
    let err: string | null = null
    if (!provider || !provider.isConfigured()) err = 'payment provider not configured'
    else if (!p?.provider_transaction_id) err = 'missing provider transaction id'
    else {
      try {
        const res = await provider.refund({ transactionId: p.provider_transaction_id, amountMinor: r.amount_minor, refundId: r.id })
        ok = res.ok
        providerRefundId = res.providerRefundId ?? null
        err = res.error ?? null
      } catch (e) {
        err = e instanceof Error ? e.message : 'refund error'
      }
    }
    const { error: ce } = await db.rpc('complete_refund', { p_refund_id: r.id, p_success: ok, p_provider_refund_id: providerRefundId, p_error: err })
    if (ce) console.error('[jobs] complete_refund', ce.message)
    result[ok ? 'succeeded' : 'failed']++
  }
  return result
}

export async function cleanupStaleUploads(): Promise<JobResult> {
  const db = createAdminClient()
  const { data, error } = await db.rpc('claim_stale_uploads', { p_older_than: '24 hours', p_limit: 200 })
  if (error) throw new Error(`claim_stale_uploads: ${error.message}`)
  const byBucket = new Map<string, string[]>()
  for (const row of data ?? []) byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row.storage_path])
  let removed = 0
  for (const [bucket, paths] of byBucket) {
    // Missing objects are fine — most abandoned uploads never reached storage.
    const { data: gone, error: re } = await db.storage.from(bucket).remove(paths)
    if (re) console.error('[jobs] storage remove', bucket, re.message)
    removed += gone?.length ?? 0
  }
  return { versions: data?.length ?? 0, objectsRemoved: removed }
}

export const JOBS = {
  'expire-appointments': () => countRpc('expire_stale_appointments'),
  reminders: () => countRpc('queue_reminders'),
  'complete-orders': () => countRpc('auto_complete_delivered_orders'),
  subscriptions: () => countRpc('process_subscription_renewals'),
  notifications: () => deliverNotifications(),
  refunds: () => processRefunds(),
  'cleanup-uploads': () => cleanupStaleUploads(),
} as const satisfies Record<string, () => Promise<JobResult>>

export type JobName = keyof typeof JOBS
