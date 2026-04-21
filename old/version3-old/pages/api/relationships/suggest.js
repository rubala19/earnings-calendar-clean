// pages/api/relationships/suggest.js
//
// POST /api/relationships/suggest
// Body: { fromSymbol, toSymbol, relType, reason }
//
// Premium endpoint. Creates a pending edge for admin review.

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { requirePremium } from '../../../lib/subscription';
import { suggestEdge } from '../../../lib/graph';

const VALID_TYPES = new Set(['upstream', 'downstream', 'peer', 'adjacent']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (!await requirePremium(req, res, session)) return;

  const { fromSymbol, toSymbol, relType, reason } = req.body;

  if (!fromSymbol || !toSymbol || !relType) {
    return res.status(400).json({ error: 'fromSymbol, toSymbol, and relType are required' });
  }

  if (!VALID_TYPES.has(relType)) {
    return res.status(400).json({ error: `relType must be one of: ${[...VALID_TYPES].join(', ')}` });
  }

  // Validate ticker format
  const tickerPattern = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;
  if (!tickerPattern.test(fromSymbol.toUpperCase()) || !tickerPattern.test(toSymbol.toUpperCase())) {
    return res.status(400).json({ error: 'Invalid ticker format' });
  }

  try {
    const result = await suggestEdge({
      fromSymbol: fromSymbol.toUpperCase(),
      toSymbol:   toSymbol.toUpperCase(),
      relType,
      reason:     reason ?? null,
      userId:     session.user.id,
    });

    if (result.duplicate) {
      return res.status(409).json({ error: 'This relationship already exists' });
    }

    return res.status(201).json({ ok: true, id: result.id });
  } catch (err) {
    console.error('[relationships/suggest] Error:', err.message);
    return res.status(500).json({ error: 'Failed to submit suggestion' });
  }
}
