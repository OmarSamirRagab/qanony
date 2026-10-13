/**
 * Environment access. Public values are inlined at build time; server-only
 * secrets must never be imported into client components.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
}

export const isSupabaseConfigured = Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey)

export function siteUrl(path = ''): string {
  return `${publicEnv.siteUrl}${path.startsWith('/') ? path : `/${path}`}`
}
