import { useEffect, useState } from 'react';

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

      // Add event
      const eventData = {
        symbol: ticker,
        name: data.name || ticker,
        date: data.date,
        time: data.time || 'TBD',
        domain: guessDomain(ticker)
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

  function guessDomain(ticker) {
    const map = {
      'AAPL': 'apple.com',
      'NVDA': 'nvidia.com',
      'AMD': 'amd.com',
      'TSM': 'tsmc.com',
      'AVGO': 'broadcom.com',
      'SNOW': 'snowflake.com',
      'PYPL': 'paypal.com'
    };
    return map[ticker] || `${ticker.toLowerCase()}.com`;
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
            {dayEvents.map((ev, idx) => (
              <div key={idx} className="event-item" title={`${ev.name} - ${ev.time}`}>
                <img 
                  src={`https://logo.clearbit.com/${ev.domain}`}
                  alt={ev.symbol}
                  onError={(e) => e.target.style.display = 'none'}
                />
                <span>{ev.symbol}</span>
              </div>
            ))}
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
