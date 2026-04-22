// pages/api/positions.js
//
// Manages user stock positions (average cost basis + quantity).
// Available to all authenticated users — not premium-gated.
//
// GET    /api/positions              — all positions for current user
// POST   /api/positions              — create or update a position (upsert)
// DELETE /api/positions?symbol=NVDA  — remove a position

import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { supabase } from '../../lib/supabase';

const DEBUG = process.env.DEBUG_LOGS === 'true';
function dbg(...args) { if (DEBUG) console.log(...args); }

const SELECT_COLS = 'id, symbol, quantity, avg_cost, notes, created_at, updated_at';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  const userId = session.user.id;

  // ── GET ───────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('positions')
      .select(SELECT_COLS)
      .eq('user_id', userId)
      .order('symbol', { ascending: true });

    if (error) {
      console.error('[positions] GET error:', error.message);
      return res.status(500).json({ error: 'Failed to load positions' });
    }

    dbg(`[positions] Loaded ${data.length} positions for user`);
    return res.status(200).json(normalizeRows(data));
  }

  // ── POST (upsert) ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { symbol, quantity, avgCost, notes } = req.body;

    if (!symbol || quantity == null || avgCost == null) {
      return res.status(400).json({ error: 'symbol, quantity and avgCost are required' });
    }

    const qty  = parseFloat(quantity);
    const cost = parseFloat(avgCost);

    if (isNaN(qty)  || qty  <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });
    if (isNaN(cost) || cost <= 0) return res.status(400).json({ error: 'avgCost must be a positive number' });

    const row = {
      user_id:  userId,
      symbol:   symbol.toUpperCase(),
      quantity: qty,
      avg_cost: cost,
      notes:    notes ?? null,
    };

    const { data, error } = await supabase
      .from('positions')
      .upsert(row, { onConflict: 'user_id,symbol' })
      .select(SELECT_COLS)
      .single();

    if (error) {
      console.error('[positions] POST error:', error.message);
      return res.status(500).json({ error: 'Failed to save position' });
    }

    dbg(`[positions] Upserted position: ${symbol} qty=${qty} cost=${cost}`);
    return res.status(200).json(normalizeRow(data));
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'symbol query parameter required' });

    const { error } = await supabase
      .from('positions')
      .delete()
      .eq('user_id', userId)
      .eq('symbol', symbol.toUpperCase());

    if (error) {
      console.error('[positions] DELETE error:', error.message);
      return res.status(500).json({ error: 'Failed to delete position' });
    }

    dbg(`[positions] Deleted position: ${symbol}`);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).end('Method Not Allowed');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeRow(r) {
  return {
    id:        r.id,
    symbol:    r.symbol,
    quantity:  parseFloat(r.quantity),
    avgCost:   parseFloat(r.avg_cost),
    notes:     r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function normalizeRows(rows) {
  return rows.map(normalizeRow);
}
