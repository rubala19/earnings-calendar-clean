// lib/ensureUser.js
//
// Upserts the authenticated user into public.users on every API request.
// This is lightweight (Postgres upsert with no-op on conflict) and ensures
// the users table stays in sync with OAuth identity data without needing
// a separate NextAuth database adapter.

import { supabase } from './supabase';

export async function ensureUser(session) {
  const { id, email, name, image } = session.user;

  const { error } = await supabase
    .from('users')
    .upsert(
      { id, email, name, image },
      { onConflict: 'id', ignoreDuplicates: false }
    );

  if (error) {
    // Non-fatal — log but don't crash the request. The user row may already
    // exist and the upsert failed for a transient reason.
    console.error('[ensureUser] Upsert failed:', error.message);
  }
}
