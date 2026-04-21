// lib/supabase.js
//
// Singleton Supabase client for server-side use only.
//
// We use the SERVICE ROLE key here, which bypasses Row Level Security and is
// safe for use in Next.js API routes (server-side only — never sent to the
// browser). All access control is enforced at the application layer via
// NextAuth session checks before any Supabase call is made.
//
// NEVER import this file from any client-side component or pages/_app.js.
// NEVER expose SUPABASE_SERVICE_ROLE_KEY to the browser.
//
// Required environment variables:
//   NEXT_PUBLIC_SUPABASE_URL      — your project URL (safe to expose)
//   SUPABASE_SERVICE_ROLE_KEY     — secret service key (server only)

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
  );
}

// Re-use the same client across hot-reloaded API routes in development
// by attaching it to the global object. In production each instance is
// isolated so this is just a module-level singleton.
const globalForSupabase = globalThis;

export const supabase =
  globalForSupabase._supabaseClient ??
  createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      // We manage auth ourselves via NextAuth — disable Supabase Auth entirely
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase._supabaseClient = supabase;
}
