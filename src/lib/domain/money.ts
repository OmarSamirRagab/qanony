/** Money is handled as integer minor units (piasters for EGP) end-to-end. */
export type Currency = 'EGP' | 'USD' | 'SAR' | 'AED'

export function toMinor(major: number): number {
  if (!Number.isFinite(major)) throw new RangeError('Invalid amount')
  return Math.round(major * 100)
}

export function fromMinor(minor: number): number {
  return minor / 100
}

export function formatMoney(minor: number | null | undefined, locale: string = 'ar', currency: Currency = 'EGP'): string {
  const value = fromMinor(minor ?? 0)
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Percentage of an amount in minor units, floored (refunds never exceed policy). */
export function percentOf(minor: number, percent: number): number {
  const p = Math.min(100, Math.max(0, percent))
  return Math.floor((minor * p) / 100)
}
