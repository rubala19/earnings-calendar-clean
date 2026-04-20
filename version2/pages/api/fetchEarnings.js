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
// ---------------------------------------------------------------------------
async function fetchFromFMP(ticker) {
  const API_KEY = process.env.FMP_API_KEY;
  if (!API_KEY) { dbg('[fmp] No FMP_API_KEY'); return null; }
  if (isExhausted('fmp')) { dbg('[fmp] Daily limit reached'); return null; }

  const url = `https://financialmodelingprep.com/api/v3/earning_calendar?symbol=${ticker}&apikey=${API_KEY}`;
  dbg('[fmp] Fetching:', ticker);

  const response = await fetch(url);
  recordCall('fmp');

  if (!response.ok) {
    if (response.status === 429) markExhausted('fmp');
    dbg('[fmp] HTTP error:', response.status);
    return null;
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const earnings = data[0];

  // Skip stale dates (more than 7 days in the past)
  if (earnings.date < sevenDaysAgoUTC()) {
    dbg('[fmp] Date is stale:', earnings.date);
    return null;
  }

  return {
    symbol: earnings.symbol,
    name: ticker,
    date: earnings.date,
    time: normalizeTime(earnings.time),
    epsEstimated: earnings.epsEstimated ?? null,
    source: 'FMP',
  };
}

// ---------------------------------------------------------------------------
// Source: Yahoo Finance (unofficial)
// No key required. Endpoint is undocumented and can break without warning.
// Does not expose BMO/AMC timing. Good broad coverage.
// ---------------------------------------------------------------------------
async function fetchFromYahooFinance(ticker) {
  if (isExhausted('yahoo')) { dbg('[yahoo] Self-throttle limit reached'); return null; }

  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=calendarEvents`;
  dbg('[yahoo] Fetching:', ticker);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; earnings-calendar/2.0)',
      'Accept': 'application/json',
    }
  });
  recordCall('yahoo');

  if (!response.ok) {
    dbg('[yahoo] HTTP error:', response.status);
    return null;
  }

  const data = await response.json();
  const earnings = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings;
  if (!earnings?.earningsDate?.[0]) return null;

  // Yahoo returns a timestamp range — use the first (earliest) value
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
