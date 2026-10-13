import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function initials(name: string | null | undefined): string {
  if (!name) return '؟'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')
}

/** Picks the English value when the locale is English and a translation exists. */
export function pick<T>(locale: string, ar: T, en: T | null | undefined): T {
  return locale === 'en' && en != null && en !== '' ? en : ar
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}
