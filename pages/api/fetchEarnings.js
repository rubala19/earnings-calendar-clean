const DEBUG = (process.env.DEBUG_LOGS === 'true');
function dbg(...args) { if (DEBUG) console.log(...args); }

// Financial Modeling Prep - More reliable than Alpha Vantage
async function fetchFromFMP(ticker) {
  const API_KEY = process.env.FMP_API_KEY;
  if (!API_KEY) {
    dbg('[fetchEarnings] No FMP_API_KEY, skipping');
    return null;
  }

  dbg('[fetchEarnings] FMP:', ticker);
  const url = `https://financialmodelingprep.com/api/v3/earning_calendar?symbol=${ticker}&apikey=${API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      const earnings = data[0]; // Get next earnings
      return {
        symbol: earnings.symbol,
        name: ticker,
        date: earnings.date,
        time: earnings.time || 'TBD',
        eps: earnings.eps,
        epsEstimated: earnings.epsEstimated,
        source: 'FMP'
      };
    }

    return null;
  } catch (err) {
    dbg('[fetchEarnings] FMP error:', err.message);
    return null;
  }
}

// Yahoo Finance (scraping - free but unofficial)
async function fetchFromYahooFinance(ticker) {
  dbg('[fetchEarnings] Yahoo Finance:', ticker);
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=calendarEvents`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const earnings = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings;
    
    if (earnings?.earningsDate?.[0]) {
      const timestamp = earnings.earningsDate[0].raw;
      const date = new Date(timestamp * 1000);
      const dateStr = date.toISOString().split('T')[0];

      return {
        symbol: ticker,
        name: ticker,
        date: dateStr,
        time: 'TBD',
        source: 'Yahoo'
      };
    }

    return null;
  } catch (err) {
    dbg('[fetchEarnings] Yahoo error:', err.message);
    return null;
  }
}

// Polygon.io - Good free tier
async function fetchFromPolygon(ticker) {
  const API_KEY = process.env.POLYGON_API_KEY;
  if (!API_KEY) {
    dbg('[fetchEarnings] No POLYGON_API_KEY, skipping');
    return null;
  }

  dbg('[fetchEarnings] Polygon:', ticker);
  const url = `https://api.polygon.io/vX/reference/financials?ticker=${ticker}&limit=1&apiKey=${API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    
    if (data?.results?.[0]) {
      const result = data.results[0];
      return {
        symbol: ticker,
        name: ticker,
        date: result.filing_date || result.end_date,
        time: 'TBD',
        source: 'Polygon'
      };
    }

    return null;
  } catch (err) {
    dbg('[fetchEarnings] Polygon error:', err.message);
    return null;
  }
}

async function fetchFromAlphaVantage(ticker) {
  const API_KEY = process.env.ALPHAVANTAGE_KEY;
  if (!API_KEY) {
    throw new Error('Missing ALPHAVANTAGE_KEY');
  }

  dbg('[fetchEarnings] Alpha Vantage:', ticker);
  const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${ticker}&horizon=3month&apikey=${API_KEY}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Alpha Vantage error: ${response.status}`);
  }

  const text = await response.text();
  
  if (text.includes('Error Message') || text.includes('Invalid API call')) {
    throw new Error('Alpha Vantage API error');
  }
  
  if (text.includes('premium')) {
    throw new Error('Rate limit reached');
  }

  const lines = text.trim().split('\n');
  if (lines.length <= 1) {
    return null;
  }

  const [symbol, name, reportDate] = lines[1].split(',');
  
  if (!reportDate || reportDate === 'None') {
    return null;
  }

  return {
    symbol,
    name,
    date: reportDate,
    time: 'TBD',
    source: 'AlphaVantage'
  };
}

async function fetchFromMarketData(ticker) {
  dbg('[fetchEarnings] MarketData:', ticker);
  const url = `https://api.marketdata.app/v1/stocks/earnings/${ticker}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    
    if (data && data.reportDate && data.reportDate.length > 0) {
      const timestamp = data.reportDate[0];
      const date = new Date(timestamp * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const time = data.reportTime?.[0] || 'TBD';

      return {
        symbol: ticker,
        name: ticker,
        date: dateStr,
        time,
        source: 'MarketData'
      };
    }

    return null;
  } catch (err) {
    dbg('[fetchEarnings] MarketData error:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { symbol } = req.query;
  
  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const ticker = symbol.toUpperCase();
  dbg('[fetchEarnings] Processing:', ticker);

  try {
    // Try sources in order of reliability
    const sources = [
      fetchFromFMP,
      fetchFromYahooFinance,
      fetchFromPolygon,
      fetchFromMarketData,
      fetchFromAlphaVantage
    ];

    for (const fetchFn of sources) {
      try {
        const data = await fetchFn(ticker);
        if (data && data.date) {
          dbg('[fetchEarnings] Success:', data.source);
          return res.status(200).json(data);
        }
      } catch (err) {
        dbg('[fetchEarnings] Source failed:', err.message);
        continue;
      }
    }

    // No data found from any source
    dbg('[fetchEarnings] No data found from any source');
    return res.status(404).json({ 
      error: `No earnings data found for ${ticker}` 
    });

  } catch (error) {
    console.error('[fetchEarnings] Error:', error.message);
    return res.status(500).json({ 
      error: error.message || 'Failed to fetch earnings' 
    });
  }
}
