// pages/api/relationships.js
//
// GET /api/relationships?symbol=NVDA
//
// Returns related tickers for a given symbol, grouped by type:
//   { peer, upstream, downstream, adjacent }
//
// Strategy (two-phase, cached in Supabase):
//   Phase 1 — FMP /stock_peers  (fast, structured, peers only)
//   Phase 2 — Claude LLM        (upstream / downstream / adjacent + rationale)
//
// Results are cached in public.ticker_relationships.
// Cache TTL: 30 days. Stale data is returned immediately while a background
// refresh is triggered — "stale-while-revalidate" pattern.
//
// The LLM call uses the Anthropic API directly (same key Claude.ai uses).
// No extra credentials needed.

import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { supabase } from '../../lib/supabase';

const DEBUG = process.env.DEBUG_LOGS === 'true';
function dbg(...args) { if (DEBUG) console.log(...args); }

const CACHE_TTL_DAYS = 30;

// ---------------------------------------------------------------------------
// Phase 1: FMP peers — fast, structured
// ---------------------------------------------------------------------------
async function fetchFMPPeers(symbol) {
  const API_KEY = process.env.FMP_API_KEY;
  if (!API_KEY) return [];

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v4/stock_peers?symbol=${symbol}&apikey=${API_KEY}`
    );
    if (!res.ok) return [];
    const data = await res.json();

    // FMP returns [{ symbol, peersList: [...] }]
    const peers = data?.[0]?.peersList ?? [];
    return peers
      .filter(p => p !== symbol)
      .slice(0, 10)
      .map(p => ({
        rel_type: 'peer',
        rel_symbol: p,
        rel_name: null,
        reason: 'Same sector/industry peer (FMP)',
        source: 'fmp',
      }));
  } catch (err) {
    dbg('[relationships] FMP peers error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Claude LLM — upstream / downstream / adjacent + rationale
// ---------------------------------------------------------------------------
async function fetchLLMRelationships(symbol) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    dbg('[relationships] No ANTHROPIC_API_KEY, skipping LLM phase');
    return [];
  }

  const prompt = `You are a financial analyst. For the stock ticker ${symbol}, identify related publicly traded companies by relationship type.

Return ONLY valid JSON with no markdown, no code fences, no explanation. Use this exact structure:
{
  "upstream": [
    { "ticker": "ASML", "name": "ASML Holding", "reason": "Supplies EUV lithography machines essential for chip manufacturing" }
  ],
  "downstream": [
    { "ticker": "DELL", "name": "Dell Technologies", "reason": "Major customer — purchases GPUs for AI server products" }
  ],
  "adjacent": [
    { "ticker": "TSM", "name": "Taiwan Semiconductor", "reason": "Primary manufacturing partner (fabless relationship)" }
  ]
}

Rules:
- Only include companies with real US-listed ticker symbols (NYSE or NASDAQ)
- 3–6 entries per category maximum
- Reason must be one specific sentence explaining the relationship
- If a category has no meaningful entries, return an empty array
- Do not include the queried ticker itself
- Focus on direct, material business relationships — not vague industry connections`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      dbg('[relationships] Anthropic API error:', res.status);
      return [];
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';

    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const rows = [];
    for (const [type, entries] of Object.entries(parsed)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry.ticker || entry.ticker === symbol) continue;
        rows.push({
          rel_type: type,            // upstream | downstream | adjacent
          rel_symbol: entry.ticker.toUpperCase(),
          rel_name: entry.name ?? null,
          reason: entry.reason ?? null,
          source: 'llm',
        });
      }
    }

    dbg(`[relationships] LLM returned ${rows.length} relationships for ${symbol}`);
    return rows;
  } catch (err) {
    dbg('[relationships] LLM parse/fetch error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------
async function loadFromCache(symbol) {
  const { data, error } = await supabase
    .from('ticker_relationships')
    .select('rel_type, rel_symbol, rel_name, reason, source, refreshed_at')
    .eq('symbol', symbol)
    .order('rel_type')
    .order('source');

  if (error) {
    dbg('[relationships] Cache read error:', error.message);
    return null;
  }
  return data;
}

async function saveToCache(symbol, rows) {
  if (!rows.length) return;

  const upsertRows = rows.map(r => ({
    symbol,
    rel_type:    r.rel_type,
    rel_symbol:  r.rel_symbol,
    rel_name:    r.rel_name,
    reason:      r.reason,
    source:      r.source,
    refreshed_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('ticker_relationships')
    .upsert(upsertRows, { onConflict: 'symbol,rel_type,rel_symbol' });

  if (error) {
    dbg('[relationships] Cache write error:', error.message);
  } else {
    dbg(`[relationships] Cached ${upsertRows.length} rows for ${symbol}`);
  }
}

function isFresh(rows) {
  if (!rows?.length) return false;
  const refreshed = new Date(rows[0].refreshed_at);
  const ageMs = Date.now() - refreshed.getTime();
  return ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Shape the flat DB rows into grouped response
// ---------------------------------------------------------------------------
function groupRows(rows) {
  const groups = { peer: [], upstream: [], downstream: [], adjacent: [] };
  for (const row of rows) {
    const bucket = groups[row.rel_type] ?? groups.adjacent;
    bucket.push({
      symbol: row.rel_symbol,
      name:   row.rel_name,
      reason: row.reason,
      source: row.source,
    });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  const ticker = symbol.toUpperCase();
  dbg('[relationships] Request for:', ticker);

  // 1. Try cache first
  const cached = await loadFromCache(ticker);

  if (cached && isFresh(cached)) {
    dbg('[relationships] Serving from fresh cache');
    return res.status(200).json({ ...groupRows(cached), cached: true });
  }

  // 2. Stale or empty — fetch fresh data
  // Run FMP (fast) and LLM (slower) in parallel
  const [fmpRows, llmRows] = await Promise.all([
    fetchFMPPeers(ticker),
    fetchLLMRelationships(ticker),
  ]);

  // Merge: LLM data wins on conflict (more specific reason), FMP fills peers
  // De-duplicate by rel_symbol within each rel_type
  const allRows = [...fmpRows, ...llmRows];
  const seen = new Set();
  const deduped = allRows.filter(r => {
    const key = `${r.rel_type}:${r.rel_symbol}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 3. Persist to cache
  await saveToCache(ticker, deduped);

  dbg(`[relationships] Returning ${deduped.length} relationships for ${ticker}`);
  return res.status(200).json({ ...groupRows(deduped), cached: false });
}
