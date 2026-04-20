// pages/api/events.js
//
// Manages earnings events for the authenticated user.
//
// GET    /api/events              — fetch all events for the current user
// POST   /api/events              — add a new event (idempotent via DB unique constraint)
// DELETE /api/events?id=<id>      — remove a specific event by its database id

import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { supabase } from '../../lib/supabase';
import { ensureUser } from '../../lib/ensureUser';

const DEBUG = process.env.DEBUG_LOGS === 'true';
function dbg(...args) { if (DEBUG) console.log(...args); }

// Columns to return to the client — never return internal ids or timestamps
// unless the client needs them. We do return `id` so the frontend can issue
// targeted DELETE requests.
const SELECT_COLUMNS = 'id, symbol, name, earnings_date, time_of_day, domain, eps_estimated, data_source, created_at';

export default async function handler(req, res) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = session.user.id;

  // Ensure user row exists in public.users (lightweight upsert)
  await ensureUser(session);

  dbg(`[events] ${req.method} user=${userId}`);

  // ── GET ───────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('earnings_events')
      .select(SELECT_COLUMNS)
      .eq('user_id', userId)
      .order('earnings_date', { ascending: true });

    if (error) {
      console.error('[events] GET error:', error.message);
      return res.status(500).json({ error: 'Failed to load events' });
    }

    dbg(`[events] Loaded ${data.length} events for user`);
    return res.status(200).json(normalizeRows(data));
  }

  // ── POST ──────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { symbol, name, date, time, domain, epsEstimated, source } = req.body;

    if (!symbol || !date) {
      return res.status(400).json({ error: 'symbol and date are required' });
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    const row = {
      user_id:       userId,
      symbol:        symbol.toUpperCase(),
      name:          name || symbol.toUpperCase(),
      earnings_date: date,
      time_of_day:   normalizeTime(time),
      domain:        domain || `${symbol.toLowerCase()}.com`,
      eps_estimated: epsEstimated ?? null,
      data_source:   source ?? null,
    };

    // upsert with ignoreDuplicates: true implements idempotency.
    // If the same (user_id, symbol, earnings_date) already exists the row is
    // left unchanged and we return the existing data — no error, no duplicate.
    const { data, error } = await supabase
      .from('earnings_events')
      .upsert(row, {
        onConflict:       'user_id,symbol,earnings_date',
        ignoreDuplicates: true,
      })
      .select(SELECT_COLUMNS);

    if (error) {
      console.error('[events] POST error:', error.message);
      return res.status(500).json({ error: 'Failed to save event' });
    }

    // After insert, return the full updated list sorted by date so the
    // frontend can replace its state in one operation — same contract as before.
    const { data: allEvents, error: fetchError } = await supabase
      .from('earnings_events')
      .select(SELECT_COLUMNS)
      .eq('user_id', userId)
      .order('earnings_date', { ascending: true });

    if (fetchError) {
      console.error('[events] POST refetch error:', fetchError.message);
      return res.status(500).json({ error: 'Saved but failed to reload events' });
    }

    dbg(`[events] Event saved, user now has ${allEvents.length} events`);
    return res.status(200).json(normalizeRows(allEvents));
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'id query parameter is required' });
    }

    // Enforce ownership: only delete if the row belongs to this user.
    // The .eq('user_id', userId) clause prevents deleting another user's events
    // even if someone guesses a valid id.
    const { error } = await supabase
      .from('earnings_events')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('[events] DELETE error:', error.message);
      return res.status(500).json({ error: 'Failed to delete event' });
    }

    // Return the remaining events list
    const { data: remaining, error: fetchError } = await supabase
      .from('earnings_events')
      .select(SELECT_COLUMNS)
      .eq('user_id', userId)
      .order('earnings_date', { ascending: true });

    if (fetchError) {
      console.error('[events] DELETE refetch error:', fetchError.message);
      return res.status(500).json({ error: 'Deleted but failed to reload events' });
    }

    dbg(`[events] Event ${id} deleted, user now has ${remaining.length} events`);
    return res.status(200).json(normalizeRows(remaining));
  }

  // ── Method not allowed ────────────────────────────────────────────────────
  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).end('Method Not Allowed');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Map DB column names to the camelCase shape the frontend already expects,
// keeping backwards compatibility with the JSONBin-era response format.
function normalizeRows(rows) {
  return rows.map(r => ({
    id:           r.id,
    symbol:       r.symbol,
    name:         r.name,
    date:         r.earnings_date,   // frontend uses `date`
    time:         r.time_of_day,     // frontend uses `time`
    domain:       r.domain,
    epsEstimated: r.eps_estimated,
    source:       r.data_source,
    createdAt:    r.created_at,
  }));
}

function normalizeTime(raw) {
  if (!raw) return 'TBD';
  const t = raw.toLowerCase().trim();
  if (t === 'bmo' || t === 'before market open')  return 'BMO';
  if (t === 'amc' || t === 'after market close')  return 'AMC';
  if (t === 'dmh' || t === 'during market hours') return 'DMH';
  return 'TBD';
}
