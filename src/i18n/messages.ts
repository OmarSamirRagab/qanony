/**
 * Message namespaces. Each lives in messages/{locale}/{namespace}.json.
 * Arabic is the source of truth for the message type; tests/unit/i18n.test.ts
 * checks that English has exactly the same keys.
 */
import type admin from '../../messages/ar/admin.json'
import type auth from '../../messages/ar/auth.json'
import type booking from '../../messages/ar/booking.json'
import type common from '../../messages/ar/common.json'
import type content from '../../messages/ar/content.json'
import type dashboard from '../../messages/ar/dashboard.json'
import type enums from '../../messages/ar/enums.json'
import type errors from '../../messages/ar/errors.json'
import type firm from '../../messages/ar/firm.json'
import type home from '../../messages/ar/home.json'
import type lawyers from '../../messages/ar/lawyers.json'
import type matters from '../../messages/ar/matters.json'
import type nav from '../../messages/ar/nav.json'
import type payments from '../../messages/ar/payments.json'
import type ai from '../../messages/ar/ai.json'

export const NAMESPACES = [
  'admin',
  'ai',
  'auth',
  'booking',
  'common',
  'content',
  'dashboard',
  'enums',
  'errors',
  'firm',
  'home',
  'lawyers',
  'matters',
  'nav',
  'payments',
] as const

export type Messages = {
  admin: typeof admin
  ai: typeof ai
  auth: typeof auth
  booking: typeof booking
  common: typeof common
  content: typeof content
  dashboard: typeof dashboard
  enums: typeof enums
  errors: typeof errors
  firm: typeof firm
  home: typeof home
  lawyers: typeof lawyers
  matters: typeof matters
  nav: typeof nav
  payments: typeof payments
}
