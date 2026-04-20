// pages/api/chart.js
//
// GET /api/chart?symbol=NVDA&range=5d   — 5-day intraday (30-min bars)
// GET /api/chart?symbol=NVDA&range=1mo  — 1-month daily bars
//
// Premium endpoint.
// Data source: Yahoo Finance v8 chart API (free, no key required).
// Uses crumb+cookie auth — same pattern as fetchEarnings.js.

import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { requirePremium } from '../../lib/subscription';

const DEBUG = process.env.DEBUG_LOGS === 'true';
function dbg(...args) { if (DEBUG) console.log(...args); }

const VALID_RANGES = {
  '5d':  { interval: '30m', range: '5d'  },
  '1mo': { interval: '1d',  range: '1mo' },
};

// Cached crumb — shared with fetchEarnings pattern
let _crumb  = null;
let _cookie = null;

async function getYahooCrumb() {
  if (_crumb && _cookie) return { crumb: _crumb, cookie: _cookie };

  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    redirect: 'follow',
  });

  const setCookie  = cookieRes.headers.get('set-cookie') || '';
  const cookieMatch = setCookie.match(/A[13]=[^;]+/);
  _cookie = cookieMatch ? cookieMatch[0] : 'A1=d=AQABBBBBB';

  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Cookie': _cookie,
    },
  });

  if (!crumbRes.ok) {
    dbg('[chart] Crumb fetch failed:', crumbRes.status);
    return null;
  }

  _crumb = await crumbRes.text();
  dbg('[chart] Got crumb');
  return { crumb: _crumb, cookie: _cookie };
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (!await requirePremium(req, res, session)) return;

  if (req.method !== 'GET') return res.status(405).end();

  const { symbol, range = '1mo' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  const config = VALID_RANGES[range];
  if (!config) {
    return res.status(400).json({ error: `Invalid range. Use: ${Object.keys(VALID_RANGES).join(', ')}` });
  }

  const ticker = symbol.toUpperCase();
  dbg(`[chart] ${ticker} range=${range}`);

  try {
    const auth = await getYahooCrumb();

    const url = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
      `?interval=${config.interval}`,
      `&range=${config.range}`,
      `&includePrePost=false`,
      `&events=div,splits`,
      auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : '',
    ].join('');

    const yahooRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept':     'application/json',
        ...(auth ? { 'Cookie': auth.cookie } : {}),
      },
    });

    if (!yahooRes.ok) {
      // Clear crumb on auth failure
      if (yahooRes.status === 401 || yahooRes.status === 403) {
        _crumb = null; _cookie = null;
      }
      dbg('[chart] Yahoo error:', yahooRes.status);
      return res.status(502).json({ error: 'Price data unavailable' });
    }

    const raw    = await yahooRes.json();
    const result = raw?.chart?.result?.[0];

    if (!result) {
      return res.status(404).json({ error: `No chart data found for ${ticker}` });
    }

    const timestamps = result.timestamp ?? [];
    const quotes     = result.indicators?.quote?.[0] ?? {};
    const closes     = quotes.close  ?? [];
    const opens      = quotes.open   ?? [];
    const highs      = quotes.high   ?? [];
    const lows       = quotes.low    ?? [];
    const volumes    = quotes.volume ?? [];
    const meta       = result.meta   ?? {};

    const points = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      points.push({
        t: timestamps[i] * 1000,
        o: opens[i]   ?? closes[i],
        h: highs[i]   ?? closes[i],
        l: lows[i]    ?? closes[i],
        c: closes[i],
        v: volumes[i] ?? 0,
      });
    }

    if (!points.length) {
      return res.status(404).json({ error: `No price data for ${ticker}` });
    }

    const firstClose = points[0].c;
    const lastClose  = points[points.length - 1].c;
    const change     = lastClose - firstClose;
    const changePct  = (change / firstClose) * 100;
    const allCloses  = points.map(p => p.c);

    dbg(`[chart] ${ticker} ${points.length} bars last=${lastClose.toFixed(2)}`);

    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');

    return res.status(200).json({
      symbol:    ticker,
      range,
      currency:  meta.currency   ?? 'USD',
      name:      meta.shortName  ?? ticker,
      lastPrice: lastClose,
      prevClose: meta.previousClose ?? firstClose,
      change,
      changePct,
      priceMin:  Math.min(...allCloses),
      priceMax:  Math.max(...allCloses),
      points,
    });

  } catch (err) {
    _crumb = null; _cookie = null;
    console.error('[chart] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch chart data' });
  }
}
