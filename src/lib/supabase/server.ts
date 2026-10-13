import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { isSupabaseConfigured, publicEnv } from '@/lib/env'
import type { Database } from '@/types/database'

export type ServerSupabase = ReturnType<typeof createServerClient<Database>>

/** User-scoped client (RLS applies). Use in Server Components, Actions and Route Handlers. */
export async function createClient() {
  if (!isSupabaseConfigured) throw new SupabaseNotConfiguredError()
  const cookieStore = await cookies()
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  })
}

/**
 * Anonymous client without cookies, for public cacheable data (lawyer listings,
 * categories, articles). Only ever sees what anonymous RLS policies allow.
 */
export function createPublicClient() {
  if (!isSupabaseConfigured) throw new SupabaseNotConfiguredError()
  return createSupabaseClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
    this.name = 'SupabaseNotConfiguredError'
  }
}
