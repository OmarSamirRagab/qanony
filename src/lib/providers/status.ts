import 'server-only'
import { activeProvider } from '@/lib/providers/payments'
import { CHANNELS } from '@/lib/providers/notify'

export interface IntegrationStatus {
  key: 'storage' | 'payments' | 'sandbox' | 'video' | 'email' | 'sms' | 'whatsapp' | 'ai' | 'scanner' | 'cron'
  configured: boolean
  mode?: string
  env: string[]
  /** True only for integrations exercised by automated tests in this repository. */
  verified: boolean
}

const has = (...names: string[]) => names.every((n) => Boolean(process.env[n]))

/** Presence-only checks: secret values are never read into the response. */
export function integrationStatuses(): IntegrationStatus[] {
  const payment = activeProvider()
  return [
    { key: 'storage', configured: has('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'), env: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'], verified: false },
    {
      key: 'payments',
      configured: has('PAYMOB_SECRET_KEY', 'PAYMOB_PUBLIC_KEY', 'PAYMOB_HMAC_SECRET', 'PAYMOB_INTEGRATION_IDS'),
      mode: payment ? `${payment.id} (${payment.mode})` : undefined,
      env: ['PAYMENTS_PROVIDER', 'PAYMOB_SECRET_KEY', 'PAYMOB_PUBLIC_KEY', 'PAYMOB_HMAC_SECRET', 'PAYMOB_INTEGRATION_IDS', 'PAYMOB_MODE', 'PAYMOB_API_BASE'],
      verified: false,
    },
    { key: 'sandbox', configured: process.env.PAYMENTS_SANDBOX_ENABLED === 'true' && has('PAYMENTS_SANDBOX_SECRET'), mode: 'sandbox', env: ['PAYMENTS_SANDBOX_ENABLED', 'PAYMENTS_SANDBOX_SECRET'], verified: true },
    { key: 'video', configured: has('DAILY_API_KEY'), env: ['DAILY_API_KEY'], verified: false },
    { key: 'email', configured: CHANNELS.email.configured(), mode: 'resend', env: ['RESEND_API_KEY', 'EMAIL_FROM'], verified: false },
    { key: 'sms', configured: CHANNELS.sms.configured(), mode: 'twilio', env: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'], verified: false },
    { key: 'whatsapp', configured: CHANNELS.whatsapp.configured(), mode: 'meta cloud api', env: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE_NAME'], verified: false },
    { key: 'ai', configured: has('ANTHROPIC_API_KEY'), mode: process.env.AI_MODEL ?? 'claude-opus-5-5', env: ['ANTHROPIC_API_KEY', 'AI_MODEL'], verified: false },
    { key: 'scanner', configured: has('CLAMAV_SCAN_URL'), env: ['CLAMAV_SCAN_URL', 'CLAMAV_SCAN_TOKEN'], verified: false },
    { key: 'cron', configured: (process.env.CRON_SECRET ?? '').length >= 16, env: ['CRON_SECRET'], verified: false },
  ]
}
