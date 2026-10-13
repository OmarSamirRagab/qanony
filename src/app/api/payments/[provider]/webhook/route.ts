import { NextResponse } from 'next/server'
import { getProvider, recordPaymentEvent } from '@/lib/providers/payments'
import { isServiceRoleConfigured } from '@/lib/supabase/admin'

/**
 * Gateway → server callback. This is the ONLY path that can mark a payment as
 * successful. Browser redirects are never trusted. Responds 200 for processed,
 * duplicate and rejected events so gateways don't retry forever; 5xx on
 * transient failures so they do.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params
  const provider = getProvider(id)
  if (!provider || !provider.isConfigured() || !isServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: 'provider_not_configured' }, { status: 404 })
  }
  let event
  try {
    event = await provider.parseWebhook(req)
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_payload' }, { status: 400 })
  }
  try {
    const result = await recordPaymentEvent(provider, event)
    if (result === 'invalid_signature') console.warn('[payments] invalid signature', provider.id, event.eventId)
    return NextResponse.json({ ok: true, result })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
