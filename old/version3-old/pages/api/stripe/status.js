// pages/api/stripe/status.js
//
// GET /api/stripe/status
// Returns the current user's subscription status.
// Used by the frontend to gate premium features without exposing
// the full subscription object.

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { isPremium, getSubscription } from '../../../lib/subscription';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  // Stub mode — bypass Stripe during development
  if (process.env.STUB_PREMIUM === 'true') {
    return res.status(200).json({
      isPremium: true,
      status:    'active',
      periodEnd: null,
      cancelAtPeriodEnd: false,
      stub: true,
    });
  }

  const [premium, sub] = await Promise.all([
    isPremium(session),
    getSubscription(session.user.id),
  ]);

  return res.status(200).json({
    isPremium: premium,
    status:    sub?.status ?? 'inactive',
    periodEnd: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
  });
}
