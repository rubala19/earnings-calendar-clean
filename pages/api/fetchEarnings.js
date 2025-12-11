const DEBUG = (process.env.DEBUG_LOGS === 'true');
function dbg(...args) { if (DEBUG) console.log(...args); }

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
  
  // Check for errors
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

  // Parse CSV
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
    // Try MarketData first
    let data = await fetchFromMarketData(ticker);
    if (data) {
      dbg('[fetchEarnings] Success: MarketData');
      return res.status(200).json(data);
    }

    // Fallback to Alpha Vantage
    data = await fetchFromAlphaVantage(ticker);
    if (data) {
      dbg('[fetchEarnings] Success: Alpha Vantage');
      return res.status(200).json(data);
    }

    // No data found
    dbg('[fetchEarnings] No data found');
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
