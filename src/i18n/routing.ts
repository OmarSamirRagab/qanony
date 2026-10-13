import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  // Arabic (default) has no prefix: /lawyers ; English: /en/lawyers
  localePrefix: 'as-needed',
  localeCookie: { name: 'QANONY_LOCALE', maxAge: 60 * 60 * 24 * 365 },
})

export type Locale = (typeof routing.locales)[number]

export function dirFor(locale: string): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr'
}

export function toLocale(value: string): Locale {
  return (routing.locales as readonly string[]).includes(value) ? (value as Locale) : routing.defaultLocale
}
