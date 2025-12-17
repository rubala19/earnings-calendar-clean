import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from 'next/router';

// Comprehensive ticker to domain mapping
const TICKER_DOMAINS = {
  'AAPL': 'apple.com', 'MSFT': 'microsoft.com', 'GOOGL': 'google.com',
  'GOOG': 'google.com', 'AMZN': 'amazon.com', 'META': 'meta.com',
  'TSLA': 'tesla.com', 'NVDA': 'nvidia.com', 'AMD': 'amd.com',
  'INTC': 'intel.com', 'ORCL': 'oracle.com', 'CRM': 'salesforce.com',
  'ADBE': 'adobe.com', 'NFLX': 'netflix.com', 'AVGO': 'broadcom.com',
  'SNAP': 'snap.com', 'PINS': 'pinterest.com', 'SPOT': 'spotify.com',
  'RBLX': 'roblox.com', 'V': 'visa.com', 'MA': 'mastercard.com',
  'PYPL': 'paypal.com', 'SQ': 'squareup.com', 'JPM': 'jpmorganchase.com',
  'BAC': 'bankofamerica.com', 'WFC': 'wellsfargo.com', 'GS': 'goldmansachs.com',
  'MS': 'morganstanley.com', 'AXP': 'americanexpress.com', 'WMT': 'walmart.com',
  'TGT': 'target.com', 'HD': 'homedepot.com', 'LOW': 'lowes.com',
  'COST': 'costco.com', 'NKE': 'nike.com', 'SBUX': 'starbucks.com',
  'MCD': 'mcdonalds.com', 'TSM': 'tsmc.com', 'ASML': 'asml.com',
  'QCOM': 'qualcomm.com', 'TXN': 'ti.com', 'AMAT': 'appliedmaterials.com',
  'LRCX': 'lamresearch.com', 'KLAC': 'kla.com', 'MRVL': 'marvell.com',
  'SNOW': 'snowflake.com', 'DDOG': 'datadoghq.com', 'NET': 'cloudflare.com',
  'TEAM': 'atlassian.com', 'NOW': 'servicenow.com', 'WDAY': 'workday.com',
  'ZM': 'zoom.us', 'OKTA': 'okta.com', 'CRWD': 'crowdstrike.com',
  'PANW': 'paloaltonetworks.com', 'F': 'ford.com', 'GM': 'gm.com',
  'TM': 'toyota.com', 'JNJ': 'jnj.com', 'UNH': 'unitedhealthgroup.com',
  'PFE': 'pfizer.com', 'ABBV': 'abbvie.com', 'TMO': 'thermofisher.com',
  'ABT': 'abbott.com', 'LLY': 'lilly.com', 'MRK': 'merck.com',
  'T': 'att.com', 'VZ': 'verizon.com', 'TMUS': 't-mobile.com',
  'XOM': 'exxonmobil.com', 'CVX': 'chevron.com', 'BA': 'boeing.com',
  'CAT': 'caterpillar.com', 'GE': 'ge.com', 'HON': 'honeywell.com',
  '3M': '3m.com', 'MMM': '3m.com', 'PG': 'pg.com', 'KO': 'coca-cola.com',
  'PEP': 'pepsico.com', 'DIS': 'disney.com', 'CMCSA': 'comcast.com'
};

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [tickerInput, setTickerInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [news, setNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      loadEvents();
    }
  }, [status]);

  async function loadEvents() {
    try {
      const res = await fetch('/api/events');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
      console.log('Loaded events:', data.length);
    } catch (err) {
      console.error('Load error:', err);
      showToast('Failed to load events', 'error');
    }
  }

  async function addTicker() {
    const ticker = tickerInput.trim().toUpperCase();
    if (!ticker) {
      showToast('Please enter a ticker', 'error');
      return;
    }
    if (!/^[A-Z]{1,5}$/.test(ticker)) {
      showToast('Invalid ticker format (1-5 letters)', 'error');
      return;
    }

    setLoading(true);
    try {
      console.log(`Fetching earnings for ${ticker}...`);
      const res = await fetch(`/api/fetchEarnings?symbol=${ticker}`);
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || `Failed to fetch ${ticker}`, 'error');
        return;
      }

      if (!data.date) {
        showToast(`No earnings date found for ${ticker}`, 'error');
        return;
      }

      const eventData = {
        symbol: ticker,
        name: data.name || ticker,
        date: data.date,
        time: data.time || 'TBD',
        domain: getDomainForTicker(ticker)
      };

      const postRes = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });

      if (!postRes.ok) {
        showToast('Failed to save event', 'error');
        return;
      }

      const updatedEvents = await postRes.json();
      setEvents(updatedEvents);
      setTickerInput('');
      showToast(`Added ${ticker} on ${data.date}`, 'success');
      console.log(`Successfully added ${ticker}`);

    } catch (err) {
      console.error('Add error:', err);
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  function getDomainForTicker(ticker) {
    return TICKER_DOMAINS[ticker] || `${ticker.toLowerCase()}.com`;
  }

  async function fetchNews(ticker) {
    console.log('fetchNews called for:', ticker);
    setLoadingNews(true);
    setSelectedTicker(ticker);
    try {
      const res = await fetch(`/api/news?symbol=${ticker}`);
      const data = await res.json();
      setNews(data.news || []);
      console.log('News fetched:', data.news?.length || 0);
    } catch (err) {
      console.error('News fetch error:', err);
      setNews([]);
    } finally {
      setLoadingNews(false);
    }
  }

  function getSentimentColor(sentiment) {
    switch (sentiment) {
      case 'positive': return '#48bb78';
      case 'negative': return '#f56565';
      default: return '#718096';
    }
  }

  function getSentimentEmoji(sentiment) {
    switch (sentiment) {
      case 'positive': return '📈';
      case 'negative': return '📉';
      default: return '➖';
    }
  }

  function showToast(message, type = 'info') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleEventClick(e, symbol) {
    e.preventDefault();
    e.stopPropagation();
    console.log('Event clicked:', symbol);
    fetchNews(symbol);
  }

  function renderCalendar() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const cells = [];
    const eventMap = {};
    
    events.forEach(ev => {
      if (!eventMap[ev.date]) eventMap[ev.date] = [];
      eventMap[ev.date].push(ev);
    });

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = formatDate(date);
      const isOtherMonth = date.getMonth() !== month;
      const dayEvents = eventMap[dateStr] || [];

      cells.push(
        <div key={i} className={`calendar-cell ${isOtherMonth ? 'other-month' : ''}`}>
          <div className="date-number">{date.getDate()}</div>
          <div className="events-list">
            {dayEvents.map((ev, idx) => {
              const colors = [
                ['#667eea', '#764ba2'], ['#f093fb', '#f5576c'],
                ['#4facfe', '#00f2fe'], ['#43e97b', '#38f9d7'],
                ['#fa709a', '#fee140'], ['#30cfd0', '#330867']
              ];
              const colorIndex = ev.symbol.charCodeAt(0) % colors.length;
              const [color1, color2] = colors[colorIndex];
              
              return (
                <div 
                  key={idx} 
                  className="event-item" 
                  title={`Click for news: ${ev.name || ev.symbol} - ${ev.time}`}
                  onClick={(e) => handleEventClick(e, ev.symbol)}
                >
                  <img 
                    src={`https://img.logo.dev/${ev.domain}?token=pk_X-1ZO13CRLuFVeI5G3F_EA`}
                    alt={ev.symbol}
                    className="company-logo"
                    onError={(e) => {
                      if (!e.target.dataset.triedBackup) {
                        e.target.dataset.triedBackup = 'true';
                        e.target.src = `https://www.google.com/s2/favicons?domain=${ev.domain}&sz=128`;
                      } else {
                        e.target.style.display = 'none';
                        const fallback = e.target.nextSibling;
                        if (fallback?.classList.contains('logo-fallback')) {
                          fallback.style.display = 'flex';
                        }
                      }
                    }}
                  />
                  <div 
                    className="logo-fallback" 
                    style={{
                      display: 'none',
                      background: `linear-gradient(135deg, ${color1}, ${color2})`
                    }}
                  >
                    {ev.symbol.substring(0, 2)}
                  </div>
                  <span className="ticker-name">{ev.symbol}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return cells;
  }

  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function prevMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  }

  function nextMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  }

  function today() {
    setViewDate(new Date());
  }

  const monthName = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  if (status === 'loading') {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>Earnings Calendar</h1>
          <p className="subtitle">Track upcoming earnings reports</p>
        </div>
        <div className="header-right">
          <div className="user-info">
            {session.user?.image && (
              <img src={session.user.image} alt="User" className="user-avatar" />
            )}
            <span className="user-name">{session.user?.name || session.user?.email}</span>
            <button onClick={() => signOut()} className="signout-btn">
              Sign out
            </button>
          </div>
          <div className="controls">
            <button onClick={prevMonth} className="nav-btn">←</button>
            <button onClick={today} className="today-btn">Today</button>
            <button onClick={nextMonth} className="nav-btn">→</button>
          </div>
        </div>
      </header>

      <div className="add-form">
        <input
          type="text"
          value={tickerInput}
          onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
          placeholder="Enter ticker (e.g., NVDA)"
          disabled={loading}
          onKeyPress={(e) => e.key === 'Enter' && addTicker()}
        />
        <button onClick={addTicker} disabled={loading}>
          {loading ? 'Loading...' : 'Add Ticker'}
        </button>
      </div>

      <div className="calendar">
        <div className="calendar-header">
          <h2>{monthName}</h2>
        </div>
        <div className="weekdays">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="weekday">{day}</div>
          ))}
        </div>
        <div className="calendar-grid">
          {renderCalendar()}
        </div>
      </div>

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      {selectedTicker && (
        <div className="news-modal" onClick={() => setSelectedTicker(null)}>
          <div className="news-content" onClick={(e) => e.stopPropagation()}>
            <div className="news-header">
              <h3>Latest News: {selectedTicker}</h3>
              <button className="close-btn" onClick={() => setSelectedTicker(null)}>×</button>
            </div>
            
            {loadingNews ? (
              <div className="loading">Loading news...</div>
            ) : news.length === 0 ? (
              <div className="no-news">No recent news found</div>
            ) : (
              <div className="news-list">
                {news.map((item, idx) => (
                  <div key={idx} className="news-item">
                    <div className="news-item-header">
                      <span className="news-source">{item.source}</span>
                      <span 
                        className="sentiment-badge"
                        style={{ backgroundColor: getSentimentColor(item.sentiment) }}
                      >
                        {getSentimentEmoji(item.sentiment)} {item.sentiment}
                      </span>
                    </div>
                    <h4 className="news-headline">
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        {item.headline}
                      </a>
                    </h4>
                    <p className="news-summary">{item.summary}</p>
                    <div className="news-meta">
                      {new Date(item.publishedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
