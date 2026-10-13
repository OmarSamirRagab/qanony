import type { Locale } from '@/i18n/routing'
import type { Messages } from '@/i18n/messages'

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: Messages
  }
}
