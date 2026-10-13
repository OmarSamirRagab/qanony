import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { publicEnv } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Service-role client: BYPASSES RLS. Only for trusted server code (webhooks,
 * cron workers, signed URL issuance) and only AFTER the caller has been
 * authorised with the user-scoped client or a security-definer RPC.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!publicEnv.supabaseUrl || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }
  return createClient<Database>(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export const isServiceRoleConfigured = () => Boolean(publicEnv.supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY)
