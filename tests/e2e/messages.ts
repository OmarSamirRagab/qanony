import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Reads UI strings from the message catalogs so selectors follow copy changes. */
export function msg(locale: 'ar' | 'en', key: string): string {
  const [ns, ...rest] = key.split('.')
  const file = path.resolve(import.meta.dirname, '..', '..', 'messages', locale, `${ns}.json`)
  const value = rest.reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], JSON.parse(readFileSync(file, 'utf8')))
  if (typeof value !== 'string') throw new Error(`Missing message ${locale}:${key}`)
  return value
}
