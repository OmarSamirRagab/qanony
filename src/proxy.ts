import { createServerClient } from '@supabase/ssr'
import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from '@/i18n/routing'
import { portalForPath } from '@/lib/domain/permissions'

const intl = createIntlMiddleware(routing)

const PROTECTED_PREFIXES = ['client', 'lawyer', 'firm', 'admin', 'consultation', 'checkout', 'dashboard', 'invitations', 'disputes', 'notifications', 'create-firm', 'invoices']

function stripLocale(pathname: string): { locale: string; rest: string } {
  const m = pathname.match(/^\/(ar|en)(?=\/|$)/)
  return m ? { locale: m[1]!, rest: pathname.slice(m[0].length) || '/' } : { locale: routing.defaultLocale, rest: pathname }
}

/**
 * 1. Locale negotiation/prefixing (next-intl).
 * 2. Supabase session refresh (rotates auth cookies on the response).
 * 3. Coarse gate: signed-out users are sent to login for any portal route.
 *    Role/tenant authorisation happens in layouts, actions and the database.
 */
export async function proxy(request: NextRequest) {
  const response = intl(request)

  // Redirects from the i18n layer are final.
  if (response.headers.get('location')) return response

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options)
      },
    },
  })

  // getClaims() verifies the JWT and refreshes the session when needed.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)

  const { locale, rest } = stripLocale(request.nextUrl.pathname)
  const first = rest.split('/')[1] ?? ''
  if (!signedIn && (PROTECTED_PREFIXES.includes(first) || portalForPath(rest))) {
    const login = request.nextUrl.clone()
    login.pathname = locale === routing.defaultLocale ? '/login' : `/${locale}/login`
    login.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`
    const redirect = NextResponse.redirect(login)
    for (const c of response.cookies.getAll()) redirect.cookies.set(c)
    return redirect
  }
  return response
}

export const config = {
  matcher: ['/((?!api|auth|_next|_vercel|.*\\..*).*)'],
}
