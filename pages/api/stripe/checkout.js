// pages/api/stripe/checkout.js
//
// POST /api/stripe/checkout
// Creates a Stripe Checkout session for the premium subscription.
// Returns { url } — the hosted Stripe checkout page URL.

import Stripe from 'stripe';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { supabase } from '../../../lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  const userId = session.user.id;
  const email  = session.user.email;

  try {
    // Check if user already has a Stripe customer ID
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, status')
      .eq('user_id', userId)
      .single();

    // If already active, redirect to billing portal instead
    if (sub?.status === 'active' || sub?.status === 'trialing') {
      return res.status(400).json({ error: 'Already subscribed', code: 'ALREADY_SUBSCRIBED' });
    }

    // Reuse existing Stripe customer if we have one
    let customerId = sub?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      customerId = customer.id;

      // Pre-create subscription row with customer ID so webhook can find the user
      await supabase
        .from('subscriptions')
        .upsert(
          { user_id: userId, stripe_customer_id: customerId, status: 'inactive' },
          { onConflict: 'user_id' }
        );
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer:               customerId,
      mode:                   'subscription',
      payment_method_types:   ['card'],
      line_items: [{
        price:    process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      success_url: `${process.env.NEXTAUTH_URL}/app?subscribed=1`,
      cancel_url:  `${process.env.NEXTAUTH_URL}/subscribe?canceled=1`,
      subscription_data: {
        metadata: { userId },
      },
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: checkoutSession.url });

  } catch (err) {
    console.error('[stripe/checkout] Error:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
