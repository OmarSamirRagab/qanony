'use client'
import { createBrowserClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'
import type { Database } from '@/types/database'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

/** Browser client (RLS applies). Singleton so realtime channels are shared. */
export function getBrowserClient() {
  client ??= createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey)
  return client
}
