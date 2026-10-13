import { NextResponse } from 'next/server'
import { paymentRefFromMerchant } from '@/lib/providers/payments/paymob'

/**
 * Browser redirect back from Paymob. The query string is NOT trusted for
 * payment status — we only use it to find the payment and show the result page,
 * which reads the status written by the verified server-to-server callback.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const ref = paymentRefFromMerchant(url.searchParams.get('merchant_order_id')) ?? ''
  const target = new URL('/checkout/result', url.origin)
  if (ref) target.searchParams.set('ref', ref)
  return NextResponse.redirect(target, { status: 303 })
}
