// lib/subscription.js
//
// Server-side helpers for subscription status checks.
// Used by API routes that require a premium subscription.
//
// isPremium(session) — returns true if the user has an active subscription
// requirePremium(req, res, session) — sends 402 and returns false if not premium
//   Usage:
//     if (!await requirePremium(req, res, session)) return;

import { supabase } from './supabase';

const DEBUG = process.env.DEBUG_LOGS === 'true';
function dbg(...args) { if (DEBUG) console.log(...args); }

// ---------------------------------------------------------------------------
// Stub mode — set STUB_PREMIUM=true in .env.local to bypass Stripe entirely
// while setting up. Every authenticated user is treated as premium.
// NEVER set this in production.
// ---------------------------------------------------------------------------
const STUB = process.env.STUB_PREMIUM === 'true';
if (STUB) console.warn('[subscription] STUB_PREMIUM=true — all users treated as premium. Do not use in production.');

// Statuses Stripe considers "access granted"
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export async function isPremium(session) {
  if (!session?.user?.id) return false;
  if (STUB) { dbg('[subscription] STUB_PREMIUM — returning true'); return true; }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', session.user.id)
    .single();

  if (error || !data) {
    dbg('[subscription] No subscription found for', session.user.id);
    return false;
  }

  // Allow access if status is active/trialing and not past period end
  if (!ACTIVE_STATUSES.has(data.status)) {
    dbg('[subscription] Status not active:', data.status);
    return false;
  }

  // Double-check period end hasn't passed (belt-and-suspenders vs webhook delay)
  if (data.current_period_end) {
    const periodEnd = new Date(data.current_period_end);
    if (periodEnd < new Date()) {
      dbg('[subscription] Period expired:', data.current_period_end);
      return false;
    }
  }

  return true;
}

export async function requirePremium(req, res, session) {
  const premium = await isPremium(session);
  if (!premium) {
    res.status(402).json({
      error: 'Premium subscription required',
      code: 'SUBSCRIPTION_REQUIRED',
    });
    return false;
  }
  return true;
}

// Get full subscription details for the settings/billing page
export async function getSubscription(userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data;
}

// Upsert subscription from Stripe webhook data
export async function upsertSubscription(userId, stripeData) {
  const row = {
    user_id:                 userId,
    stripe_customer_id:      stripeData.customer,
    stripe_subscription_id:  stripeData.id,
    status:                  stripeData.status,
    price_id:                stripeData.items?.data?.[0]?.price?.id ?? null,
    current_period_start:    stripeData.current_period_start
      ? new Date(stripeData.current_period_start * 1000).toISOString()
      : null,
    current_period_end:      stripeData.current_period_end
      ? new Date(stripeData.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end:    stripeData.cancel_at_period_end ?? false,
  };

  const { error } = await supabase
    .from('subscriptions')
    .upsert(row, { onConflict: 'user_id' });

  if (error) {
    console.error('[subscription] Upsert failed:', error.message);
    throw error;
  }

  dbg('[subscription] Upserted subscription for user:', userId, 'status:', row.status);
}

// Find user_id from stripe_customer_id (used in webhook handler)
export async function getUserIdByCustomer(stripeCustomerId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (error || !data) return null;
  return data.user_id;
}
