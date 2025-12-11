import { useEffect, useState } from 'react';

// Comprehensive ticker to domain mapping
const TICKER_DOMAINS = {
  // Tech Giants
  'AAPL': 'apple.com',
  'MSFT': 'microsoft.com',
  'GOOGL': 'google.com',
  'GOOG': 'google.com',
  'AMZN': 'amazon.com',
  'META': 'meta.com',
  'TSLA': 'tesla.com',
  'NVDA': 'nvidia.com',
  'AMD': 'amd.com',
  'INTC': 'intel.com',
  'ORCL': 'oracle.com',
  'CRM': 'salesforce.com',
  'ADBE': 'adobe.com',
  'NFLX': 'netflix.com',
  'AVGO': 'broadcom.com',
  
  // Social/Media
  'SNAP': 'snap.com',
  'PINS': 'pinterest.com',
  'SPOT': 'spotify.com',
  'RBLX': 'roblox.com',
  
  // Finance
  'V': 'visa.com',
  'MA': 'mastercard.com',
  'PYPL': 'paypal.com',
  'SQ': 'squareup.com',
  'JPM': 'jpmorganchase.com',
  'BAC': 'bankofamerica.com',
  'WFC': 'wellsfargo.com',
  'GS': 'goldmansachs.com',
  'MS': 'morganstanley.com',
  'AXP': 'americanexpress.com',
  
  // Retail
  'WMT': 'walmart.com',
  'TGT': 'target.com',
  'HD': 'homedepot.com',
  'LOW': 'lowes.com',
  'COST': 'costco.com',
  'NKE': 'nike.com',
  'SBUX': 'starbucks.com',
  'MCD': 'mcdonalds.com',
  
  // Semiconductors
  'TSM': 'tsmc.com',
  'ASML': 'asml.com',
  'QCOM': 'qualcomm.com',
  'TXN': 'ti.com',
  'AMAT': 'appliedmaterials.com',
  'LRCX': 'lamresearch.com',
  'KLAC': 'kla.com',
  'MRVL': 'marvell.com',
  
  // Cloud/SaaS
  'SNOW': 'snowflake.com',
  'DDOG': 'datadoghq.com',
  'NET': 'cloudflare.com',
  'TEAM': 'atlassian.com',
  'NOW': 'servicenow.com',
  'WDAY': 'workday.com',
  'ZM': 'zoom.us',
  'OKTA': 'okta.com',
  'CRWD': 'crowdstrike.com',
  'PANW': 'paloaltonetworks.com',
  
  // Auto
  'F': 'ford.com',
  'GM': 'gm.com',
  'TM': 'toyota.com',
  
  // Healthcare/Pharma
  'JNJ': 'jnj.com',
  'UNH': 'unitedhealthgroup.com',
  'PFE': 'pfizer.com',
  'ABBV': 'abbvie.com',
  'TMO': 'thermofisher.com',
  'ABT': 'abbott.com',
  'LLY': 'lilly.com',
  'MRK': 'merck.com',
  
  // Telecom
  'T': 'att.com',
  'VZ': 'verizon.com',
  'TMUS': 't-mobile.com',
  
  // Energy
  'XOM': 'exxonmobil.com',
  'CVX': 'chevron.com',
  
  // Industrial
  'BA': 'boeing.com',
  'CAT': 'caterpillar.com',
  'GE': 'ge.com',
  'HON': 'honeywell.com',
  '3M': '3m.com',
  'MMM': '3m.com',
  
  // Consumer
  'PG': 'pg.com',
  'KO': 'coca-cola.com',
  'PEP': 'pepsico.com',
  'DIS': 'disney.com',
  'CMCSA': 'comcast.com'
};

export default function Home() {
  const [events, setEvents] = useState([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [tickerInput, setTickerInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadEvents();
  }, []);

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

      // Add event with proper domain
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

  function showToast(message, type = 'info') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function renderCalendar() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const cells = [];
    const eventMap = {};
    
    // Build event map
    events.forEach(ev => {
      if (!eventMap[ev.date]) eventMap[ev.date] = [];
      eventMap[ev.date].push(ev);
    });

    // Generate 42 cells (6 weeks)
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
              // Generate a consistent color for each ticker
              const colors = [
                ['#667eea', '#764ba2'],
                ['#f093fb', '#f5576c'],
                ['#4facfe', '#00f2fe'],
                ['#43e97b', '#38f9d7'],
                ['#fa709a', '#fee140'],
                ['#30cfd0', '#330867']
              ];
              const colorIndex = ev.symbol.charCodeAt(0) % colors.length;
              const [color1, color2] = colors[colorIndex];
              
              return (
                <div key={idx} className="event-item" title={`${ev.name || ev.symbol} - ${ev.time}`}>
                  <img 
                    src={`https://logo.clearbit.com/${ev.domain}`}
                    alt={ev.symbol}
                    className="company-logo"
                    onError={(e) => {
                      // Try alternative logo source
                      if (!e.target.dataset.triedBackup) {
                        e.target.dataset.triedBackup = 'true';
                        e.target.src = `https://img.logo.dev/${ev.domain}?token=pk_X-1ZO13CRLuFVeI5G3F_EA`;
                      } else {
                        // Show fallback
                        e.target.style.display = 'none';
                        const fallback = e.target.nextSibling;
                        if (fallback && fallback.classList.contains('logo-fallback')) {
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

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>Earnings Calendar</h1>
          <p className="subtitle">Track upcoming earnings reports</p>
        </div>
        <div className="controls">
          <button onClick={prevMonth} className="nav-btn">←</button>
          <button onClick={today} className="today-btn">Today</button>
          <button onClick={nextMonth} className="nav-btn">→</button>
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
    </div>
  );
}
