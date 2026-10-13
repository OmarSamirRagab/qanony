import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { paymentRefFromMerchant, paymobHmac, paymobProvider } from '@/lib/providers/payments/paymob'
import { sandboxProvider, sandboxSign, type SandboxCallback } from '@/lib/providers/payments/sandbox'
import { emailAdapter, toE164 } from '@/lib/providers/notify'

const env = { ...process.env }
afterEach(() => {
  process.env = { ...env }
  vi.unstubAllGlobals()
})

describe('sandbox gateway signatures', () => {
  beforeEach(() => {
    process.env.PAYMENTS_SANDBOX_ENABLED = 'true'
    process.env.PAYMENTS_SANDBOX_SECRET = 'test-secret-value-123'
  })
  const cb: SandboxCallback = { event_id: 'e1', payment_id: 'PAY-2026-000001', provider_order_id: 'sbx_1', success: true, amount_minor: 50000, currency: 'EGP' }
  const request = (body: unknown, sig: string) =>
    new Request('https://x.test/api/payments/sandbox/webhook', { method: 'POST', headers: { 'x-sandbox-signature': sig, 'content-type': 'application/json' }, body: JSON.stringify(body) })

  it('accepts a correctly signed callback', async () => {
    const ev = await sandboxProvider.parseWebhook(request(cb, sandboxSign(cb)))
    expect(ev.signatureValid).toBe(true)
    expect(ev.amountMinor).toBe(50000)
    expect(ev.paymentRef).toBe('PAY-2026-000001')
  })

  it('rejects tampered amounts and missing signatures', async () => {
    const sig = sandboxSign(cb)
    expect((await sandboxProvider.parseWebhook(request({ ...cb, amount_minor: 1 }, sig))).signatureValid).toBe(false)
    expect((await sandboxProvider.parseWebhook(request(cb, ''))).signatureValid).toBe(false)
    expect((await sandboxProvider.parseWebhook(request(cb, 'zz'))).signatureValid).toBe(false)
  })

  it('is disabled unless explicitly enabled with a secret', () => {
    process.env.PAYMENTS_SANDBOX_ENABLED = 'false'
    expect(sandboxProvider.isConfigured()).toBe(false)
  })
})

describe('paymob callback verification (implementation self-consistency; not verified against Paymob)', () => {
  const secret = 'paymob-hmac-secret'
  const obj = {
    amount_cents: 50000,
    created_at: '2026-10-13T10:00:00.000000',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: 123456,
    integration_id: 999,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 777, merchant_order_id: 'PAY-2026-000001-abc' },
    owner: 1,
    pending: false,
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    success: true,
  }

  it('computes HMAC-SHA512 over the documented field order', () => {
    const concatenated = '500002026-10-13T10:00:00.000000EGPfalsefalse123456999truefalsefalsefalsetruefalse7771false2346MasterCardcardtrue'
    expect(paymobHmac(obj, secret)).toBe(createHmac('sha512', secret).update(concatenated).digest('hex'))
  })

  it('verifies signatures and maps the merchant reference', async () => {
    process.env.PAYMOB_HMAC_SECRET = secret
    const hmac = paymobHmac(obj, secret)
    const ok = await paymobProvider.parseWebhook(new Request(`https://x.test/api/payments/paymob/webhook?hmac=${hmac}`, { method: 'POST', body: JSON.stringify({ type: 'TRANSACTION', obj }) }))
    expect(ok.signatureValid).toBe(true)
    expect(ok.kind).toBe('transaction')
    expect(ok.paymentRef).toBe('PAY-2026-000001')
    const bad = await paymobProvider.parseWebhook(
      new Request(`https://x.test/api/payments/paymob/webhook?hmac=${hmac}`, { method: 'POST', body: JSON.stringify({ type: 'TRANSACTION', obj: { ...obj, amount_cents: 1 } }) }),
    )
    expect(bad.signatureValid).toBe(false)
  })

  it('ignores refund/void callbacks for fulfilment', async () => {
    process.env.PAYMOB_HMAC_SECRET = secret
    const refunded = { ...obj, is_refunded: true }
    const ev = await paymobProvider.parseWebhook(new Request(`https://x.test/w?hmac=${paymobHmac(refunded, secret)}`, { method: 'POST', body: JSON.stringify({ type: 'TRANSACTION', obj: refunded }) }))
    expect(ev.kind).toBe('ignored')
  })

  it('parses merchant references defensively', () => {
    expect(paymentRefFromMerchant('PAY-2026-000001-k3')).toBe('PAY-2026-000001')
    expect(paymentRefFromMerchant(42)).toBeNull()
    expect(paymentRefFromMerchant('nodash')).toBeNull()
  })
})

describe('notification adapters', () => {
  it('normalises Egyptian mobile numbers to E.164', () => {
    expect(toE164('01012345678')).toBe('+201012345678')
    expect(toE164('+201112345678')).toBe('+201112345678')
    expect(toE164('201512345678')).toBe('+201512345678')
    expect(toE164('0123')).toBeNull()
    expect(toE164(null)).toBeNull()
  })

  it('reports unconfigured email and escapes HTML when sending', async () => {
    delete process.env.RESEND_API_KEY
    expect(emailAdapter.configured()).toBe(false)
    process.env.RESEND_API_KEY = 're_test'
    process.env.EMAIL_FROM = 'Qanony <no-reply@example.com>'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://qanony.example'
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await emailAdapter.send({ to: 'a@b.co', locale: 'ar', title: '<script>x</script>', body: 'a & b', link: 'https://evil.example/phish' })
    expect(res).toEqual({ ok: true, provider: 'resend', messageId: 'msg_1' })
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as { html: string }
    expect(sent.html).not.toContain('<script>')
    expect(sent.html).toContain('&lt;script&gt;')
    expect(sent.html).not.toContain('evil.example') // external links are never forwarded
  })

  it('marks provider 5xx/429 as retryable and 4xx as permanent', async () => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.EMAIL_FROM = 'x@example.com'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })))
    expect(await emailAdapter.send({ to: 'a@b.co', locale: 'en', title: 't', body: 'b', link: null })).toMatchObject({ ok: false, retryable: true })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 422 })))
    expect(await emailAdapter.send({ to: 'a@b.co', locale: 'en', title: 't', body: 'b', link: null })).toMatchObject({ ok: false, retryable: false })
  })
})

describe('cron endpoint authorisation', () => {
  it('rejects missing/incorrect bearer tokens and unknown jobs', async () => {
    vi.doMock('@/lib/jobs', () => ({ JOBS: { reminders: async () => ({ processed: 3 }) } }))
    const { GET } = await import('@/app/api/cron/[job]/route')
    const ctx = (job: string) => ({ params: Promise.resolve({ job }) })
    delete process.env.CRON_SECRET
    expect((await GET(new Request('https://x.test/api/cron/reminders'), ctx('reminders'))).status).toBe(503)
    process.env.CRON_SECRET = 'a-very-long-cron-secret'
    expect((await GET(new Request('https://x.test/api/cron/reminders'), ctx('reminders'))).status).toBe(401)
    expect((await GET(new Request('https://x.test/api/cron/reminders', { headers: { authorization: 'Bearer wrong' } }), ctx('reminders'))).status).toBe(401)
    const auth = { headers: { authorization: 'Bearer a-very-long-cron-secret' } }
    expect((await GET(new Request('https://x.test/api/cron/nope', auth), ctx('nope'))).status).toBe(404)
    const ok = await GET(new Request('https://x.test/api/cron/reminders', auth), ctx('reminders'))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ ok: true, result: { processed: 3 } })
  })
})
