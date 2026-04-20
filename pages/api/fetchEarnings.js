import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

const DEBUG = (process.env.DEBUG_LOGS === 'true');
function dbg(...args) { if (DEBUG) console.log(...args); }

// ---------------------------------------------------------------------------
// Round-robin state
//
// Three sources with free-tier daily limits:
//   FMP            250 calls/day
//   Yahoo Finance  unofficial, no hard cap — self-throttle at 500/day
//   Nasdaq DL      50 calls/day
//
// Each incoming request rotates which source it tries FIRST based on
// (totalRequests % 3). If the primary source fails or is exhausted, the
// request falls through to the remaining two in order.
//
// This ensures no single source absorbs all traffic and daily limits are
// spread proportionally. Counters reset at midnight UTC and are in-process
// (reset on cold start). For multi-instance deployments, move to Redis.
// ---------------------------------------------------------------------------

const LIMITS = {
  fmp:    250,
  yahoo:  500,   // self-imposed — Yahoo has no documented hard cap
  nasdaq: 50,
};

const counters = {
  fmp:    { calls: 0, date: todayUTC() },
  yahoo:  { calls: 0, date: todayUTC() },
  nasdaq: { calls: 0, date: todayUTC() },
};

let totalRequests = 0;

function todayUTC() {
  return new Date().toISOString().split('T')[0];
}

function resetIfNewDay(source) {
  const today = todayUTC();
  if (counters[source].date !== today) {
    counters[source].calls = 0;
    counters[source].date = today;
    dbg(`[fetchEarnings] Reset daily counter for ${source}`);
  }
}

function isExhausted(source) {
  resetIfNewDay(source);
  return counters[source].calls >= LIMITS[source];
}

function recordCall(source) {
  resetIfNewDay(source);
  counters[source].calls++;
  dbg(`[fetchEarnings] ${source} calls today: ${counters[source].calls}/${LIMITS[source]}`);
}

function markExhausted(source) {
  counters[source].calls = LIMITS[source];
}

// ---------------------------------------------------------------------------
// Normalize time-of-day labels to a consistent format
// ---------------------------------------------------------------------------
function normalizeTime(raw) {
  if (!raw) return 'TBD';
  const t = raw.toLowerCase().trim();
  if (t === 'bmo' || t === 'before market open')  return 'BMO';
  if (t === 'amc' || t === 'after market close')  return 'AMC';
  if (t === 'dmh' || t === 'during market hours') return 'DMH';
  return 'TBD';
}

function sevenDaysAgoUTC() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Source: Financial Modeling Prep
// Limit: 250 calls/day on free tier
// Has BMO/AMC timing and EPS estimates
//
// FMP free tier supports /stable/earnings (v4 stable endpoint).
// /v3/earning_calendar requires a paid plan on newer accounts.
// We try the stable endpoint first, then fall back to v3.
// ---------------------------------------------------------------------------
async function fetchFromFMP(ticker) {
  const API_KEY = process.env.FMP_API_KEY;
  if (!API_KEY) { dbg('[fmp] No FMP_API_KEY'); return null; }
  if (isExhausted('fmp')) { dbg('[fmp] Daily limit reached'); return null; }

  dbg('[fmp] Fetching:', ticker);

  // Try the stable endpoint first (free tier friendly)
  // Then fall back to v3 which some older free accounts can still access
  const endpoints = [
    `https://financialmodelingprep.com/stable/earnings?symbol=${ticker}&apikey=${API_KEY}`,
    `https://financialmodelingprep.com/api/v3/earning_calendar?symbol=${ticker}&apikey=${API_KEY}`,
  ];

  for (const url of endpoints) {
    const response = await fetch(url);
    recordCall('fmp');

    if (!response.ok) {
      if (response.status === 429) markExhausted('fmp');
      if (response.status === 403) {
        dbg('[fmp] 403 on endpoint, trying next:', url.includes('stable') ? 'stable' : 'v3');
        continue; // try the next endpoint
      }
      dbg('[fmp] HTTP error:', response.status);
      return null;
    }

    const data = await response.json();

    // Both endpoints return an array; stable may wrap in { data: [] }
    const rows = Array.isArray(data) ? data
      : Array.isArray(data?.data) ? data.data
      : null;

    if (!rows || rows.length === 0) {
      dbg('[fmp] Empty response from endpoint');
      continue;
    }

    // Filter to upcoming dates only, sort ascending, take first
    const today = todayUTC();
    const upcoming = rows
      .filter(e => e.date && e.date >= sevenDaysAgoUTC())
      .sort((a, b) => a.date.localeCompare(b.date));

    if (upcoming.length === 0) {
      dbg('[fmp] No upcoming dates in response');
      continue;
    }

    const earnings = upcoming[0];
    dbg('[fmp] Found date:', earnings.date, 'from endpoint:', url.includes('stable') ? 'stable' : 'v3');

    return {
      symbol: earnings.symbol || ticker,
      name: ticker,
      date: earnings.date,
      time: normalizeTime(earnings.time),
      epsEstimated: earnings.epsEstimated ?? earnings.revenueEstimated ?? null,
      source: 'FMP',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Source: Yahoo Finance
// No key required. Yahoo now requires a crumb+cookie pair for their API.
// We fetch the crumb first, then use it for the quoteSummary call.
// This is the current working approach as of 2026.
// ---------------------------------------------------------------------------

// Cached crumb so we don't fetch it on every request
let _yahooCrumb = null;
let _yahooCookie = null;

async function getYahooCrumb() {
  if (_yahooCrumb && _yahooCookie) return { crumb: _yahooCrumb, cookie: _yahooCookie };

  // Step 1: get a session cookie from Yahoo Finance
  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    redirect: 'follow',
  });

  const setCookie = cookieRes.headers.get('set-cookie') || '';
  // Extract the A3 or A1 cookie value that Yahoo needs
  const cookieMatch = setCookie.match(/A[13]=[^;]+/);
  _yahooCookie = cookieMatch ? cookieMatch[0] : 'A1=d=AQABBBBBB';

  // Step 2: fetch the crumb using that cookie
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Cookie': _yahooCookie,
    },
  });

  if (!crumbRes.ok) {
    dbg('[yahoo] Crumb fetch failed:', crumbRes.status);
    return null;
  }

  _yahooCrumb = await crumbRes.text();
  dbg('[yahoo] Got crumb:', _yahooCrumb?.substring(0, 8) + '...');
  return { crumb: _yahooCrumb, cookie: _yahooCookie };
}

async function fetchFromYahooFinance(ticker) {
  if (isExhausted('yahoo')) { dbg('[yahoo] Self-throttle limit reached'); return null; }

  dbg('[yahoo] Fetching:', ticker);

  try {
    const auth = await getYahooCrumb();
    if (!auth) {
      dbg('[yahoo] Could not get crumb, skipping');
      return null;
    }

    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=calendarEvents&crumb=${encodeURIComponent(auth.crumb)}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': auth.cookie,
        'Accept': 'application/json',
      },
    });
    recordCall('yahoo');

    if (!response.ok) {
      // If 401, clear the cached crumb so next call re-fetches it
      if (response.status === 401 || response.status === 403) {
        _yahooCrumb = null;
        _yahooCookie = null;
      }
      dbg('[yahoo] HTTP error:', response.status);
      return null;
    }

    const data = await response.json();
    const earnings = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings;
    if (!earnings?.earningsDate?.[0]) {
      dbg('[yahoo] No earningsDate in response');
      return null;
    }

    const timestamp = earnings.earningsDate[0].raw;
    const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0];

    if (dateStr < sevenDaysAgoUTC()) {
      dbg('[yahoo] Date is stale:', dateStr);
      return null;
    }

    return {
      symbol: ticker,
      name: ticker,
      date: dateStr,
      time: 'TBD',
      epsEstimated: earnings.earningsAverage?.raw ?? null,
      source: 'Yahoo',
    };

  } catch (err) {
    // Clear crumb cache on any error so next request starts fresh
    _yahooCrumb = null;
    _yahooCookie = null;
    dbg('[yahoo] Error:', err.message);
    return null;
  }
}
// ---------------------------------------------------------------------------
// Source: Nasdaq Data Link (formerly Quandl)
// Limit: 50 calls/day on free tier
// Uses the ZACKS/FC (Zacks Fundamentals Collection) dataset.
// ann_date = actual earnings announcement date.
// Requires a free account at data.nasdaq.com to get an API key.
// ---------------------------------------------------------------------------
async function fetchFromNasdaq(ticker) {
  const API_KEY = process.env.NASDAQ_DATA_LINK_KEY;
  if (!API_KEY) { dbg('[nasdaq] No NASDAQ_DATA_LINK_KEY'); return null; }
  if (isExhausted('nasdaq')) { dbg('[nasdaq] Daily limit reached'); return null; }

  // Request only the columns we need, filtered to this ticker
  const params = new URLSearchParams({
    ticker,
    api_key: API_KEY,
    'qopts.columns': 'ticker,per_end_date,per_type,ann_date',
    'qopts.per_page': '10',
  });
  const url = `https://data.nasdaq.com/api/v3/datatables/ZACKS/FC?${params}`;
  dbg('[nasdaq] Fetching:', ticker);

  const response = await fetch(url);
  recordCall('nasdaq');

  if (!response.ok) {
    if (response.status === 429 || response.status === 403) markExhausted('nasdaq');
    dbg('[nasdaq] HTTP error:', response.status);
    return null;
  }

  const data = await response.json();
  const rows = data?.datatable?.data;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // Columns returned: [ticker, per_end_date, per_type, ann_date]
  const today = todayUTC();
  const cutoff = sevenDaysAgoUTC();

  // Prefer upcoming announcements; fall back to very recent ones
  const withDates = rows.filter(r => r[3]); // ann_date must be present
  const upcoming = withDates
    .filter(r => r[3] >= today)
    .sort((a, b) => a[3].localeCompare(b[3]));

  const recent = withDates
    .filter(r => r[3] >= cutoff && r[3] < today)
    .sort((a, b) => b[3].localeCompare(a[3]));

  const chosen = upcoming[0] || recent[0];
  if (!chosen) return null;

  return {
    symbol: ticker,
    name: ticker,
    date: chosen[3],
    time: 'TBD',
    epsEstimated: null,
    source: 'Nasdaq',
  };
}

// ---------------------------------------------------------------------------
// Round-robin ordering
// Returns the three fetch functions starting from `startIndex`, wrapping
// around so every third request starts from a different source.
// ---------------------------------------------------------------------------
const ALL_SOURCES = [fetchFromFMP, fetchFromYahooFinance, fetchFromNasdaq];

function orderedSources(startIndex) {
  const i = startIndex % ALL_SOURCES.length;
  return [...ALL_SOURCES.slice(i), ...ALL_SOURCES.slice(0, i)];
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { symbol } = req.query;
  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const ticker = symbol.toUpperCase();
  const myRequest = totalRequests++;
  const startIndex = myRequest % ALL_SOURCES.length;

  dbg(`[fetchEarnings] Request #${myRequest} ticker=${ticker} startIndex=${startIndex}`);

  for (const fetchFn of orderedSources(startIndex)) {
    try {
      const data = await fetchFn(ticker);
      if (data?.date) {
        dbg(`[fetchEarnings] Got result from ${data.source}`);
        return res.status(200).json({
          ...data,
          // Only expose counter state in debug mode — don't leak usage info in prod
          ...(DEBUG && {
            _debug: {
              requestNumber: myRequest,
              startIndex,
              counters: {
                fmp:    `${counters.fmp.calls}/${LIMITS.fmp}`,
                yahoo:  `${counters.yahoo.calls}/${LIMITS.yahoo}`,
                nasdaq: `${counters.nasdaq.calls}/${LIMITS.nasdaq}`,
              },
            }
          }),
        });
      }
    } catch (err) {
      dbg(`[fetchEarnings] Source threw:`, err.message);
      // Continue to next source
    }
  }

  dbg('[fetchEarnings] No data found from any source for', ticker);
  return res.status(404).json({
    error: `No earnings data found for ${ticker}`,
  });
}
