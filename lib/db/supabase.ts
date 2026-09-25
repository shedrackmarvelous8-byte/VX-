import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY
const supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let supabaseSchemaHealthy: boolean | null = null

// Asynchronously check Supabase table availability on startup
if (supabaseUrl && supabaseSecretKey) {
  try {
    const testClient = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    Promise.resolve(testClient.from('profiles').select('id').limit(1))
      .then(({ error }) => {
        if (error && (error.code === 'PGRST205' || error.message?.includes('not find the table'))) {
          console.warn('[Supabase] Database tables not found in schema cache. Using high-speed persistent store.')
          supabaseSchemaHealthy = false
        } else {
          supabaseSchemaHealthy = !error
        }
      })
      .catch(() => {
        supabaseSchemaHealthy = false
      })
  } catch {
    supabaseSchemaHealthy = false
  }
} else {
  supabaseSchemaHealthy = false
}

/**
 * Checks if Supabase credentials are configured and tables exist.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && (supabaseSecretKey || supabaseAnonKey) && supabaseSchemaHealthy !== false)
}

/**
 * Marks Supabase as unavailable (e.g. after PGRST205 missing table error)
 * so subsequent queries immediately use high-speed persistence without timeout delays.
 */
export function markSupabaseUnavailable() {
  supabaseSchemaHealthy = false
}

/**
 * Creates an admin Supabase client with secret service role key (backend only).
 * Returns null if Supabase tables do not exist or credentials are not configured.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseSecretKey) {
    return null
  }
  if (supabaseSchemaHealthy === false) {
    return null
  }
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Creates a standard Supabase client with publishable anon key.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey || supabaseSchemaHealthy === false) {
    return null
  }
  return createClient(supabaseUrl, supabaseAnonKey)
}
