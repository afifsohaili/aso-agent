import { createClient } from '@supabase/supabase-js'
import type { Database } from '~/supabase/types'

export function initSupabaseAdmin(supabaseUrl: string, supabaseServiceRoleKey: string) {
  return createClient<Database>(
    supabaseUrl, supabaseServiceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
