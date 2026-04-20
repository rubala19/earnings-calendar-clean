// pages/api/relationships.js
//
// GET /api/relationships?symbol=NVDA
//
// Premium endpoint. Returns related tickers from the graph DB grouped by type.
// If no edges exist for the symbol, seeds them from FMP + LLM then returns.
//
// Response shape:
//   { peer: [...], upstream: [...], downstream: [...], adjacent: [...], userVotes: {} }

import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { requirePremium } from '../../lib/subscription';
import {
  getEdges, hasEdges, upsertEdges, groupEdges, getUserVotes
} from '../../lib/graph';

const DEBUG = process.env.DEBUG_LOGS === 'true';
function dbg(...args) { if (DEBUG) console.log(...args); }

// ---------------------------------------------------------------------------
// Seeding: FMP peers
// ---------------------------------------------------------------------------
async function seedFromFMP(symbol) {
  const API_KEY = process.env.FMP_API_KEY;
  if (!API_KEY) return [];

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v4/stock_peers?symbol=${symbol}&apikey=${API_KEY}`
    );
    if (!res.ok) return [];

    const data = await res.json();
    const peers = data?.[0]?.peersList ?? [];

    return peers
      .filter(p => p !== symbol)
      .slice(0, 10)
      .map(p => ({
        to_symbol:  p,
        rel_type:   'peer',
        reason:     'Same sector/industry peer (FMP)',
        confidence: 0.75,
        source:     'fmp',
      }));
  } catch (err) {
    dbg('[relationships] FMP seed error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Seeding: Claude LLM for upstream / downstream / adjacent
// ---------------------------------------------------------------------------
async function seedFromLLM(symbol) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    dbg('[relationships] No ANTHROPIC_API_KEY, skipping LLM seed');
    return [];
  }

  const prompt = `You are a financial analyst. For the stock ticker ${symbol}, identify related publicly traded companies by relationship type.

Return ONLY valid JSON with no markdown, no code fences, no explanation:
{
  "upstream": [
    { "ticker": "ASML", "name": "ASML Holding", "reason": "Supplies EUV lithography machines essential for chip manufacturing" }
  ],
  "downstream": [
    { "ticker": "DELL", "name": "Dell Technologies", "reason": "Major customer purchases GPUs for AI server products" }
  ],
  "adjacent": [
    { "ticker": "TSM", "name": "Taiwan Semiconductor", "reason": "Primary manufacturing partner fabless relationship" }
  ]
}

Rules:
- Only include companies with real US-listed ticker symbols (NYSE or NASDAQ)
- 3 to 6 entries per category maximum
- Reason must be one specific sentence explaining the relationship
- If a category has no meaningful entries return an empty array
- Do not include the queried ticker itself
- Focus on direct material business relationships only`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      dbg('[relationships] LLM error:', res.status);
      return [];
    }

    const data   = await res.json();
    const text   = data.content?.[0]?.text ?? '';
    const clean  = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const rows = [];
    for (const [type, entries] of Object.entries(parsed)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry.ticker || entry.ticker === symbol) continue;
        rows.push({
          to_symbol:  entry.ticker.toUpperCase(),
          rel_type:   type,
          reason:     entry.reason ?? null,
          confidence: 0.6,
          source:     'llm',
        });
      }
    }

    dbg(`[relationships] LLM seeded ${rows.length} rows for ${symbol}`);
    return rows;

  } catch (err) {
    dbg('[relationships] LLM seed error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (!await requirePremium(req, res, session)) return;

  if (req.method !== 'GET') return res.status(405).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  const ticker = symbol.toUpperCase();
  dbg('[relationships] Request for:', ticker);

  // 1. Check if we have edges in the graph
  const exists = await hasEdges(ticker);

  if (!exists) {
    dbg('[relationships] No edges found, seeding:', ticker);
    const [fmpRows, llmRows] = await Promise.all([
      seedFromFMP(ticker),
      seedFromLLM(ticker),
    ]);

    const allRows = [...fmpRows, ...llmRows];
    const seen    = new Set();
    const deduped = allRows.filter(r => {
      const key = `${r.rel_type}:${r.to_symbol}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length > 0) {
      await upsertEdges(ticker, deduped);
    }
  }

  // 2. Read edges from graph DB
  const edges = await getEdges(ticker);

  // 3. Get this user's existing votes for these edges
  const edgeIds   = edges.map(e => e.id);
  const userVotes = await getUserVotes(session.user.id, edgeIds);

  const grouped = groupEdges(edges);

  dbg(`[relationships] Returning ${edges.length} edges for ${ticker}`);
  return res.status(200).json({ ...grouped, userVotes });
}
