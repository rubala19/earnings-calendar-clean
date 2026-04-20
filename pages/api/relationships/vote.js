// pages/api/relationships/vote.js
//
// POST /api/relationships/vote
// Body: { edgeId: number, vote: 1 | -1, comment?: string }
//
// Premium endpoint. Records or updates a user's vote on a relationship edge.
// Triggers confidence recalculation via Postgres function.

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { requirePremium } from '../../../lib/subscription';
import { castVote } from '../../../lib/graph';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (!await requirePremium(req, res, session)) return;

  const { edgeId, vote, comment } = req.body;

  if (!edgeId || ![1, -1].includes(vote)) {
    return res.status(400).json({ error: 'edgeId and vote (1 or -1) are required' });
  }

  try {
    await castVote({
      edgeId:  Number(edgeId),
      userId:  session.user.id,
      vote,
      comment: comment ?? null,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[relationships/vote] Error:', err.message);
    return res.status(500).json({ error: 'Failed to record vote' });
  }
}
