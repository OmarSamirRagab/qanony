import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { NAMESPACES, type Messages } from './messages'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => [ns, (await import(`../../messages/${locale}/${ns}.json`)).default] as const),
  )
  return {
    locale,
    messages: Object.fromEntries(entries) as Messages,
    timeZone: 'Africa/Cairo',
    now: new Date(),
    formats: {
      dateTime: {
        short: { day: 'numeric', month: 'short', year: 'numeric' },
        long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
        time: { hour: 'numeric', minute: '2-digit' },
        dateTime: { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' },
        dayShort: { weekday: 'short', day: 'numeric', month: 'short' },
      },
    },
  }
})
