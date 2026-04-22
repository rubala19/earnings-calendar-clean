// pages/api/stripe/portal.js
//
// POST /api/stripe/portal
// Creates a Stripe Customer Portal session so users can manage their
// subscription (cancel, update payment method, view invoices).

import Stripe from 'stripe';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSubscription } from '../../../lib/subscription';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  const sub = await getSubscription(session.user.id);
  if (!sub?.stripe_customer_id) {
    return res.status(404).json({ error: 'No subscription found' });
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: `${process.env.NEXTAUTH_URL}/app`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error('[stripe/portal] Error:', err.message);
    return res.status(500).json({ error: 'Failed to create portal session' });
  }
}
