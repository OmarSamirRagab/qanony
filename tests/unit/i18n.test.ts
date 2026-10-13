import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NAMESPACES } from '@/i18n/messages'

const root = path.resolve(import.meta.dirname, '..', '..', 'messages')

function keys(obj: unknown, prefix = ''): string[] {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
  }
  return [prefix]
}

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]!).sort()
}

describe('i18n catalogs', () => {
  it('registers every namespace file', () => {
    const files = readdirSync(path.join(root, 'ar')).map((f) => f.replace('.json', '')).sort()
    expect(files).toEqual([...NAMESPACES].sort())
  })

  for (const ns of NAMESPACES) {
    it(`"${ns}" has identical keys and placeholders in Arabic and English`, () => {
      const ar = JSON.parse(readFileSync(path.join(root, 'ar', `${ns}.json`), 'utf8'))
      const en = JSON.parse(readFileSync(path.join(root, 'en', `${ns}.json`), 'utf8'))
      expect(keys(en).sort()).toEqual(keys(ar).sort())
      for (const k of keys(ar)) {
        const a = k.split('.').reduce((o, p) => o[p], ar)
        const e = k.split('.').reduce((o, p) => o[p], en)
        if (typeof a === 'string' && typeof e === 'string') expect(placeholders(e), `${ns}.${k}`).toEqual(placeholders(a))
      }
    })
  }
})

describe('i18n key hygiene', () => {
  it('uses no dotted keys (next-intl treats dots as nesting)', () => {
    const dotted: string[] = []
    const walk = (obj: unknown, at: string) => {
      if (obj && typeof obj === 'object' && !Array.isArray(obj))
        for (const [k, v] of Object.entries(obj)) {
          if (k.includes('.')) dotted.push(`${at}.${k}`)
          walk(v, `${at}.${k}`)
        }
    }
    for (const locale of ['ar', 'en'])
      for (const ns of NAMESPACES) walk(JSON.parse(readFileSync(path.join(root, locale, `${ns}.json`), 'utf8')), `${locale}/${ns}`)
    expect(dotted).toEqual([])
  })
})
