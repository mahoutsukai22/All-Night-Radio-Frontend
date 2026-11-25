import type { SupabaseClient } from '@supabase/supabase-js';

let client: Promise<SupabaseClient> | undefined;

/** Supabase is loaded on demand so it never blocks the first paint. */
export const getSupabase = () =>
  (client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      { auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true } },
    ),
  ));
