const DEBUG = (process.env.DEBUG_LOGS === 'true');
function dbg(...args) { if (DEBUG) console.log(...args); }

// Enhanced sentiment analysis with more keywords and patterns
function analyzeSentiment(text) {
  const lowerText = text.toLowerCase();
  
  const positiveWords = [
    'profit', 'gain', 'growth', 'surge', 'jump', 'rally', 'beat', 'exceed',
    'strong', 'boost', 'rise', 'climb', 'soar', 'bullish', 'upgrade', 'positive',
    'record', 'high', 'success', 'outperform', 'innovative', 'breakthrough',
    'increase', 'up', 'better', 'improved', 'optimistic', 'confident', 'advance',
    'winning', 'milestone', 'achieve', 'expand', 'revenue', 'earnings beat'
  ];
  
  const negativeWords = [
    'loss', 'fall', 'drop', 'decline', 'plunge', 'miss', 'weak', 'worry',
    'concern', 'down', 'bear', 'bearish', 'cut', 'downgrade', 'negative',
    'risk', 'fail', 'worst', 'lawsuit', 'investigation', 'warning',
    'decrease', 'lower', 'disappointing', 'missed', 'below', 'slump', 'crash',
    'trouble', 'problem', 'crisis', 'layoff', 'bankruptcy', 'debt', 'losses'
  ];
  
  let score = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  
  positiveWords.forEach(word => {
    const regex = new RegExp('\\b' + word + '\\b', 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      positiveCount += matches.length;
      score += matches.length;
    }
  });
  
  negativeWords.forEach(word => {
    const regex = new RegExp('\\b' + word + '\\b', 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      negativeCount += matches.length;
      score -= matches.length;
    }
  });
  
  dbg('[sentiment]', { positiveCount, negativeCount, score });
  
  // Normalize to -1 to 1 scale
  const normalizedScore = Math.max(-1, Math.min(1, score / 3));
  
  let sentiment = 'neutral';
  if (normalizedScore > 0.15) sentiment = 'positive';
  else if (normalizedScore < -0.15) sentiment = 'negative';
  
  return { 
    score: normalizedScore, 
    sentiment,
    details: { positiveCount, negativeCount }
  };
}

// Finnhub News API
async function fetchFromFinnhub(ticker) {
  const API_KEY = process.env.FINNHUB_API_KEY;
  if (!API_KEY) {
    dbg('[news] No FINNHUB_API_KEY');
    return null;
  }

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromDate = weekAgo.toISOString().split('T')[0];
  const toDate = today.toISOString().split('T')[0];

  const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${fromDate}&to=${toDate}&token=${API_KEY}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      const news = data.slice(0, 5).map(item => {
        const text = `${item.headline} ${item.summary}`;
        const analysis = analyzeSentiment(text);
        
        return {
          headline: item.headline,
          summary: item.summary,
          url: item.url,
          source: item.source,
          publishedAt: new Date(item.datetime * 1000).toISOString(),
          sentiment: analysis.sentiment,
          sentimentScore: analysis.score
        };
      });
      
      return news;
    }

    return null;
  } catch (err) {
    dbg('[news] Finnhub error:', err.message);
    return null;
  }
}

// Alpha Vantage News
async function fetchFromAlphaVantage(ticker) {
  const API_KEY = process.env.ALPHAVANTAGE_KEY;
  if (!API_KEY) {
    dbg('[news] No ALPHAVANTAGE_KEY');
    return null;
  }

  const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${ticker}&limit=5&apikey=${API_KEY}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    
    if (data.feed && Array.isArray(data.feed) && data.feed.length > 0) {
      const news = data.feed.map(item => {
        // Alpha Vantage provides sentiment scores
        const tickerSentiment = item.ticker_sentiment?.find(ts => ts.ticker === ticker);
        let sentimentScore = 0;
        let sentiment = 'neutral';
        
        if (tickerSentiment) {
          sentimentScore = parseFloat(tickerSentiment.ticker_sentiment_score) || 0;
          sentiment = tickerSentiment.ticker_sentiment_label?.toLowerCase() || 'neutral';
        }
        
        return {
          headline: item.title,
          summary: item.summary,
          url: item.url,
          source: item.source,
          publishedAt: item.time_published,
          sentiment: sentiment,
          sentimentScore: sentimentScore
        };
      });
      
      return news;
    }

    return null;
  } catch (err) {
    dbg('[news] Alpha Vantage error:', err.message);
    return null;
  }
}

// Financial Modeling Prep News
async function fetchFromFMP(ticker) {
  const API_KEY = process.env.FMP_API_KEY;
  if (!API_KEY) {
    dbg('[news] No FMP_API_KEY');
    return null;
  }

  const url = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${ticker}&limit=5&apikey=${API_KEY}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      const news = data.map(item => {
        const text = `${item.title} ${item.text}`;
        const analysis = analyzeSentiment(text);
        
        return {
          headline: item.title,
          summary: item.text,
          url: item.url,
          source: item.site,
          publishedAt: item.publishedDate,
          sentiment: analysis.sentiment,
          sentimentScore: analysis.score
        };
      });
      
      return news;
    }

    return null;
  } catch (err) {
    dbg('[news] FMP error:', err.message);
    return null;
  }
}

// Yahoo Finance News (free, no key needed)
async function fetchFromYahoo(ticker) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${ticker}&newsCount=5`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    
    if (data.news && Array.isArray(data.news) && data.news.length > 0) {
      const news = data.news.slice(0, 5).map(item => {
        const text = `${item.title}`;
        const analysis = analyzeSentiment(text);
        
        return {
          headline: item.title,
          summary: item.title, // Yahoo doesn't provide full summary in this endpoint
          url: item.link,
          source: item.publisher,
          publishedAt: new Date(item.providerPublishTime * 1000).toISOString(),
          sentiment: analysis.sentiment,
          sentimentScore: analysis.score
        };
      });
      
      return news;
    }

    return null;
  } catch (err) {
    dbg('[news] Yahoo error:', err.message);
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
  dbg('[news] Fetching news for:', ticker);

  try {
    // Try sources in order
    const sources = [
      fetchFromAlphaVantage,  // Has built-in sentiment
      fetchFromFinnhub,
      fetchFromFMP,
      fetchFromYahoo
    ];

    for (const fetchFn of sources) {
      try {
        const news = await fetchFn(ticker);
        if (news && news.length > 0) {
          dbg('[news] Success, found', news.length, 'articles');
          return res.status(200).json({ news });
        }
      } catch (err) {
        dbg('[news] Source failed:', err.message);
        continue;
      }
    }

    // No news found
    return res.status(200).json({ news: [] });

  } catch (error) {
    console.error('[news] Error:', error.message);
    return res.status(500).json({ 
      error: error.message || 'Failed to fetch news' 
    });
  }
}
