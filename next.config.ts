import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : ''
const isDev = process.env.NODE_ENV !== 'production'

// Content Security Policy. Next.js injects inline bootstrap scripts, so
// 'unsafe-inline' is required for scripts without a nonce-based setup; see
// SECURITY.md for the nonce hardening path.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://*.daily.co`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `img-src 'self' data: blob:${supabaseHost ? ` https://${supabaseHost}` : ''}`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  `connect-src 'self'${supabaseHost ? ` https://${supabaseHost} wss://${supabaseHost}` : ''} https://*.daily.co wss://*.daily.co https://*.pluot.blue wss://*.pluot.blue`,
  `frame-src 'self' https://*.daily.co https://accept.paymob.com`,
  `media-src 'self' blob:`,
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self' https://accept.paymob.com`,
  `frame-ancestors 'none'`,
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self "https://*.daily.co"), microphone=(self "https://*.daily.co"), display-capture=(self "https://*.daily.co"), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Private, per-user responses must never be cached by shared caches.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ]
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    // The root layout lives under [locale]; unmatched URLs outside it use app/global-not-found.tsx.
    globalNotFound: true,
  },
}

export default withNextIntl(nextConfig)
