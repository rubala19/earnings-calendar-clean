// lib/graph.js
//
// Helpers for reading and writing the ticker relationship graph.
// Used by pages/api/relationships/*.js

import { supabase } from './supabase';

const DEBUG = process.env.DEBUG_LOGS === 'true';
function dbg(...args) { if (DEBUG) console.log(...args); }

// Minimum confidence to show an edge to users
export const MIN_CONFIDENCE = 0.25;

// ---------------------------------------------------------------------------
// Node helpers
// ---------------------------------------------------------------------------

export async function ensureNode(symbol, meta = {}) {
  const { error } = await supabase
    .from('ticker_nodes')
    .upsert(
      { symbol, ...meta },
      { onConflict: 'symbol', ignoreDuplicates: true }
    );
  if (error) dbg('[graph] ensureNode error:', error.message);
}

// ---------------------------------------------------------------------------
// Edge reads
// ---------------------------------------------------------------------------

// Get all active edges for a symbol above confidence threshold
export async function getEdges(symbol) {
  const { data, error } = await supabase
    .from('ticker_edges')
    .select(`
      id,
      from_symbol,
      to_symbol,
      rel_type,
      reason,
      confidence,
      source,
      vote_up,
      vote_down,
      created_at
    `)
    .eq('from_symbol', symbol)
    .eq('status', 'active')
    .gte('confidence', MIN_CONFIDENCE)
    .order('confidence', { ascending: false });

  if (error) {
    dbg('[graph] getEdges error:', error.message);
    return [];
  }
  return data ?? [];
}

// Check if we have any edges for a symbol (to decide if seeding is needed)
export async function hasEdges(symbol) {
  const { count, error } = await supabase
    .from('ticker_edges')
    .select('id', { count: 'exact', head: true })
    .eq('from_symbol', symbol)
    .eq('status', 'active');

  if (error) return false;
  return (count ?? 0) > 0;
}

// Get all edges — for admin panel
export async function getAllEdgesPaginated({ page = 0, pageSize = 50, status = 'active' } = {}) {
  const from = page * pageSize;
  const to   = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('ticker_edges')
    .select('*, ticker_nodes!ticker_edges_to_symbol_fkey(name)', { count: 'exact' })
    .eq('status', status)
    .order('confidence', { ascending: false })
    .range(from, to);

  if (error) {
    dbg('[graph] getAllEdgesPaginated error:', error.message);
    return { data: [], count: 0 };
  }
  return { data: data ?? [], count: count ?? 0 };
}

// Get pending / low-confidence queue for admin
export async function getAdminQueue() {
  const { data, error } = await supabase
    .from('admin_edge_queue')
    .select('*')
    .limit(100);

  if (error) {
    dbg('[graph] getAdminQueue error:', error.message);
    return [];
  }
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Edge writes
// ---------------------------------------------------------------------------

// Bulk upsert edges (used by seeding)
export async function upsertEdges(fromSymbol, rows) {
  if (!rows.length) return;

  // Ensure all referenced nodes exist
  const symbols = [...new Set([fromSymbol, ...rows.map(r => r.to_symbol)])];
  for (const sym of symbols) {
    await ensureNode(sym);
  }

  const edgeRows = rows.map(r => ({
    from_symbol: fromSymbol,
    to_symbol:   r.to_symbol,
    rel_type:    r.rel_type,
    reason:      r.reason ?? null,
    confidence:  r.confidence ?? 0.6,
    source:      r.source ?? 'llm',
    status:      'active',
    created_by:  'system',
  }));

  const { error } = await supabase
    .from('ticker_edges')
    .upsert(edgeRows, {
      onConflict:       'from_symbol,to_symbol,rel_type',
      ignoreDuplicates: true,   // don't overwrite existing edges with LLM re-seeds
    });

  if (error) {
    dbg('[graph] upsertEdges error:', error.message);
    throw error;
  }

  dbg(`[graph] Upserted ${edgeRows.length} edges for ${fromSymbol}`);
}

// Add a single user-suggested edge (status=pending, awaits admin approval)
export async function suggestEdge({ fromSymbol, toSymbol, relType, reason, userId }) {
  await ensureNode(fromSymbol);
  await ensureNode(toSymbol);

  const { data, error } = await supabase
    .from('ticker_edges')
    .insert({
      from_symbol: fromSymbol,
      to_symbol:   toSymbol,
      rel_type:    relType,
      reason,
      confidence:  0.5,
      source:      'user',
      status:      'pending',
      created_by:  userId,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { duplicate: true };
    dbg('[graph] suggestEdge error:', error.message);
    throw error;
  }
  return { id: data.id };
}

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

export async function castVote({ edgeId, userId, vote, comment }) {
  // Upsert vote (user can change their vote)
  const { error: voteError } = await supabase
    .from('ticker_edge_votes')
    .upsert(
      { edge_id: edgeId, user_id: userId, vote, comment },
      { onConflict: 'edge_id,user_id' }
    );

  if (voteError) {
    dbg('[graph] castVote error:', voteError.message);
    throw voteError;
  }

  // Recount votes from the votes table (source of truth)
  const { data: votes, error: countError } = await supabase
    .from('ticker_edge_votes')
    .select('vote')
    .eq('edge_id', edgeId);

  if (countError) {
    dbg('[graph] vote count error:', countError.message);
    return;
  }

  const voteUp   = votes.filter(v => v.vote ===  1).length;
  const voteDown = votes.filter(v => v.vote === -1).length;

  // Update counts and trigger confidence recalculation
  await supabase
    .from('ticker_edges')
    .update({ vote_up: voteUp, vote_down: voteDown })
    .eq('id', edgeId);

  // Call the Postgres confidence function
  await supabase.rpc('recalculate_edge_confidence', { p_edge_id: edgeId });

  dbg(`[graph] Vote recorded: edge=${edgeId} user=${userId} vote=${vote} up=${voteUp} down=${voteDown}`);
}

// Get a user's existing votes for a set of edge IDs
export async function getUserVotes(userId, edgeIds) {
  if (!edgeIds.length) return {};

  const { data, error } = await supabase
    .from('ticker_edge_votes')
    .select('edge_id, vote')
    .eq('user_id', userId)
    .in('edge_id', edgeIds);

  if (error) return {};

  // Return map of edgeId → vote
  return Object.fromEntries((data ?? []).map(v => [v.edge_id, v.vote]));
}

// ---------------------------------------------------------------------------
// Admin actions
// ---------------------------------------------------------------------------

export async function adminUpdateEdge({ edgeId, adminId, action, updates, note }) {
  // Fetch old values for audit
  const { data: old } = await supabase
    .from('ticker_edges')
    .select('*')
    .eq('id', edgeId)
    .single();

  const { error } = await supabase
    .from('ticker_edges')
    .update({ ...updates, reviewed_by: adminId })
    .eq('id', edgeId);

  if (error) throw error;

  // Write audit log
  await supabase.from('ticker_edge_audit').insert({
    edge_id:    edgeId,
    admin_id:   adminId,
    action,
    old_values: old,
    new_values: updates,
    note,
  });
}

// ---------------------------------------------------------------------------
// Shape rows → grouped response  { peer: [], upstream: [], downstream: [], adjacent: [] }
// ---------------------------------------------------------------------------
export function groupEdges(edges) {
  const groups = { peer: [], upstream: [], downstream: [], adjacent: [] };
  for (const edge of edges) {
    const bucket = groups[edge.rel_type] ?? groups.adjacent;
    bucket.push({
      id:         edge.id,
      symbol:     edge.to_symbol,
      reason:     edge.reason,
      confidence: edge.confidence,
      source:     edge.source,
      voteUp:     edge.vote_up,
      voteDown:   edge.vote_down,
    });
  }
  return groups;
}
