import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/validation'

/**
 * Handles Supabase email links: PKCE `code` exchange (sign-up confirmation,
 * magic link, password recovery) and `token_hash` verification.
 * `next` is restricted to same-site relative paths (no open redirects).
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const next = safeNextPath(url.searchParams.get('next'))
  if (!isSupabaseConfigured) return NextResponse.redirect(new URL('/', url.origin))
  const supabase = await createClient()

  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null

  let ok = false
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    ok = !error
  }
  if (ok) {
    // Link any pending firm invitations sent to this email.
    await supabase.rpc('claim_firm_invitations')
    return NextResponse.redirect(new URL(next, url.origin))
  }
  return NextResponse.redirect(new URL('/login?error=link', url.origin))
}
