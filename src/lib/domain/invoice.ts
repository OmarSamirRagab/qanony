/** Invoice arithmetic in minor units. */
export interface InvoiceLine {
  description: string
  quantity: number
  unit_minor: number
}

export interface InvoiceTotals {
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
}

export function invoiceTotals(lines: InvoiceLine[], taxBps = 0): InvoiceTotals {
  let subtotal = 0
  for (const line of lines) {
    if (!Number.isInteger(line.unit_minor) || line.unit_minor < 0) throw new RangeError('Invalid unit price')
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new RangeError('Invalid quantity')
    subtotal += Math.round(line.quantity * line.unit_minor)
  }
  const tax = Math.floor((subtotal * taxBps + 5000) / 10000)
  return { subtotalMinor: subtotal, taxMinor: tax, totalMinor: subtotal + tax }
}
