// pages/api/stripe/webhook.js
//
// POST /api/stripe/webhook
// Receives Stripe webhook events and keeps public.subscriptions in sync.
//
// Events handled:
//   checkout.session.completed       — subscription created via checkout
//   customer.subscription.updated    — plan change, renewal, cancellation toggle
//   customer.subscription.deleted    — hard cancellation
//   invoice.payment_failed           — payment failed → past_due
//   invoice.payment_succeeded        — payment recovered

import Stripe from 'stripe';
import { upsertSubscription, getUserIdByCustomer } from '../../../lib/subscription';
import { supabase } from '../../../lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
});

// Disable Next.js body parsing — Stripe needs the raw body for signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  ()    => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  console.log('[stripe/webhook] Event:', event.type);

  try {
    switch (event.type) {

      // ── Checkout completed ──────────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;

        // Fetch the full subscription object
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const userId = subscription.metadata?.userId
          ?? await getUserIdByCustomer(session.customer);

        if (!userId) {
          console.error('[stripe/webhook] Could not find userId for customer:', session.customer);
          break;
        }

        await upsertSubscription(userId, subscription);
        break;
      }

      // ── Subscription updated (renewal, cancel toggle, plan change) ──────
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId
          ?? await getUserIdByCustomer(subscription.customer);

        if (!userId) {
          console.error('[stripe/webhook] Could not find userId for customer:', subscription.customer);
          break;
        }

        await upsertSubscription(userId, subscription);
        break;
      }

      // ── Subscription deleted (hard cancel) ─────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId
          ?? await getUserIdByCustomer(subscription.customer);

        if (!userId) break;

        // Mark as canceled — don't delete the row (preserve billing history)
        await supabase
          .from('subscriptions')
          .update({
            status:               'canceled',
            cancel_at_period_end: false,
          })
          .eq('user_id', userId);

        break;
      }

      // ── Payment failed ──────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const userId = subscription.metadata?.userId
          ?? await getUserIdByCustomer(invoice.customer);

        if (!userId) break;
        await upsertSubscription(userId, subscription);
        break;
      }

      // ── Payment succeeded (recovery) ────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (!invoice.subscription || invoice.billing_reason === 'subscription_create') break;

        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const userId = subscription.metadata?.userId
          ?? await getUserIdByCustomer(invoice.customer);

        if (!userId) break;
        await upsertSubscription(userId, subscription);
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[stripe/webhook] Handler error:', err.message);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
