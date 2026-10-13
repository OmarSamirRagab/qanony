import 'server-only'
import { siteUrl } from '@/lib/env'

/**
 * Outbound notification channels. Each adapter talks to the provider's public
 * REST API with credentials from server-only environment variables. When a
 * channel is not configured the worker records the delivery as `skipped` —
 * nothing is ever reported as sent without a provider message id.
 *
 * Status: implemented from provider documentation; NOT verified against live
 * accounts in this repository (no credentials available).
 */

export interface OutboundMessage {
  to: string
  locale: string
  title: string
  body: string
  link: string | null
}

export type SendResult = { ok: true; provider: string; messageId: string } | { ok: false; provider: string; error: string; retryable: boolean }

export interface ChannelAdapter {
  provider: string
  configured(): boolean
  send(msg: OutboundMessage): Promise<SendResult>
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function absoluteLink(link: string | null, locale: string): string | null {
  if (!link) return null
  if (/^https?:\/\//.test(link)) return null // never forward arbitrary external links
  return siteUrl(locale === 'ar' ? link : `/${locale}${link}`)
}

async function failure(provider: string, res: Response): Promise<SendResult> {
  const text = (await res.text().catch(() => '')).slice(0, 300)
  return { ok: false, provider, error: `HTTP ${res.status} ${text}`, retryable: res.status >= 500 || res.status === 429 }
}

// ---------------------------------------------------------------------------
// Email — Resend (https://resend.com/docs/api-reference/emails/send-email)
// ---------------------------------------------------------------------------
export const emailAdapter: ChannelAdapter = {
  provider: 'resend',
  configured: () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  async send(msg) {
    const href = absoluteLink(msg.link, msg.locale)
    const dir = msg.locale === 'ar' ? 'rtl' : 'ltr'
    const cta = msg.locale === 'ar' ? 'عرض التفاصيل' : 'View details'
    const html = `<!doctype html><html lang="${msg.locale}" dir="${dir}"><body style="font-family:Tahoma,Arial,sans-serif;background:#f7f5f0;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e7e2d6">
<h1 style="font-size:18px;color:#13213c;margin:0 0 12px">${escapeHtml(msg.title)}</h1>
<p style="font-size:15px;line-height:1.7;color:#333;margin:0 0 16px">${escapeHtml(msg.body)}</p>
${href ? `<a href="${escapeHtml(href)}" style="display:inline-block;background:#13213c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${cta}</a>` : ''}
</div></body></html>`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.title, html, text: `${msg.body}${href ? `\n\n${href}` : ''}` }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return failure('resend', res)
    const data = (await res.json()) as { id?: string }
    return data.id ? { ok: true, provider: 'resend', messageId: data.id } : { ok: false, provider: 'resend', error: 'missing id', retryable: true }
  },
}

// ---------------------------------------------------------------------------
// SMS — Twilio Programmable Messaging
// ---------------------------------------------------------------------------
export const smsAdapter: ChannelAdapter = {
  provider: 'twilio',
  configured: () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
  async send(msg) {
    const sid = process.env.TWILIO_ACCOUNT_SID!
    const href = absoluteLink(msg.link, msg.locale)
    const body = `${msg.title}: ${msg.body}${href ? ` ${href}` : ''}`.slice(0, 600)
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: msg.to, From: process.env.TWILIO_FROM!, Body: body }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return failure('twilio', res)
    const data = (await res.json()) as { sid?: string }
    return data.sid ? { ok: true, provider: 'twilio', messageId: data.sid } : { ok: false, provider: 'twilio', error: 'missing sid', retryable: true }
  },
}

// ---------------------------------------------------------------------------
// WhatsApp — Meta Cloud API. Business-initiated messages require a
// pre-approved template; WHATSAPP_TEMPLATE_NAME must accept two body
// parameters ({{1}} title, {{2}} body) in both ar and en.
// ---------------------------------------------------------------------------
export const whatsappAdapter: ChannelAdapter = {
  provider: 'whatsapp_cloud',
  configured: () => Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_NAME),
  async send(msg) {
    const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
    const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID!)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: msg.to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: process.env.WHATSAPP_TEMPLATE_NAME,
          language: { code: msg.locale === 'ar' ? 'ar' : 'en' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: msg.title.slice(0, 200) }, { type: 'text', text: msg.body.slice(0, 900) }] }],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return failure('whatsapp_cloud', res)
    const data = (await res.json()) as { messages?: { id: string }[] }
    const id = data.messages?.[0]?.id
    return id ? { ok: true, provider: 'whatsapp_cloud', messageId: id } : { ok: false, provider: 'whatsapp_cloud', error: 'missing message id', retryable: true }
  },
}

export const CHANNELS = { email: emailAdapter, sms: smsAdapter, whatsapp: whatsappAdapter } as const

/** Egyptian mobile numbers stored as 01XXXXXXXXX are converted to E.164. */
export function toE164(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/[^\d+]/g, '')
  if (/^\+\d{8,15}$/.test(digits)) return digits
  if (/^01[0125]\d{8}$/.test(digits)) return `+2${digits}`
  if (/^201[0125]\d{8}$/.test(digits)) return `+${digits}`
  return null
}
