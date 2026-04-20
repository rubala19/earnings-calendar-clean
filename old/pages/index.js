import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';

// ─── Constants ────────────────────────────────────────────────────────────────

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
  'MMM': '3m.com', 'PG': 'pg.com', 'KO': 'coca-cola.com',
  'PEP': 'pepsico.com', 'DIS': 'disney.com', 'CMCSA': 'comcast.com',
  'BRK.B': 'berkshirehathaway.com', 'BRK.A': 'berkshirehathaway.com',
  'BF.B': 'brown-forman.com', 'BF.A': 'brown-forman.com',
};

const TIME_META = {
  BMO: { label: 'Pre-mkt', title: 'Before Market Open', cls: 'badge-bmo' },
  AMC: { label: 'After-mkt', title: 'After Market Close', cls: 'badge-amc' },
  DMH: { label: 'Intraday', title: 'During Market Hours', cls: 'badge-dmh' },
  TBD: { label: 'TBD', title: 'Time Not Confirmed', cls: 'badge-tbd' },
};

const MAX_VISIBLE_EVENTS = 3; // cap per cell before "+N more"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayStr() { return fmtDate(new Date()); }

function isPast(dateStr) { return dateStr < todayStr(); }

function domainFor(ticker) {
  return TICKER_DOMAINS[ticker] || `${ticker.toLowerCase().replace('.', '')}.com`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompanyLogo({ domain, symbol, colorIndex }) {
  const colors = [
    ['#3b82f6','#1d4ed8'], ['#8b5cf6','#6d28d9'], ['#ec4899','#be185d'],
    ['#10b981','#065f46'], ['#f59e0b','#92400e'], ['#06b6d4','#0e7490'],
  ];
  const [c1, c2] = colors[colorIndex % colors.length];
  const [src, setSrc] = useState(`/api/logo?domain=${encodeURIComponent(domain)}`);
  const [useFallback, setUseFallback] = useState(false);

  function handleError() {
    if (src.startsWith('/api/logo')) {
      setSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
    } else {
      setUseFallback(true);
    }
  }

  if (useFallback) {
    return (
      <span className="logo-initials" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
        {symbol.slice(0, 2)}
      </span>
    );
  }
  return <img src={src} alt={symbol} className="company-logo" onError={handleError} />;
}

// Single event pill on the calendar
function EventPill({ ev, onNews, onDelete, deletingId }) {
  const isDeleting = deletingId === ev.id;
  const past = isPast(ev.date);
  const timeMeta = TIME_META[ev.time] || TIME_META.TBD;
  const colorIdx = ev.symbol.charCodeAt(0) % 6;

  return (
    <div
      className={`event-pill ${past ? 'past' : ''} ${isDeleting ? 'deleting' : ''}`}
      onClick={() => !isDeleting && onNews(ev.symbol, ev)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onNews(ev.symbol, ev)}
      aria-label={`${ev.symbol} earnings ${ev.date}`}
    >
      <CompanyLogo domain={ev.domain} symbol={ev.symbol} colorIndex={colorIdx} />
      <span className="pill-ticker">{ev.symbol}</span>
      {ev.time && ev.time !== 'TBD' && (
        <span className={`time-badge ${timeMeta.cls}`} title={timeMeta.title}>
          {timeMeta.label}
        </span>
      )}
      <button
        className="pill-delete"
        onClick={e => { e.stopPropagation(); onDelete(ev.id); }}
        disabled={isDeleting}
        title="Remove"
        aria-label={`Remove ${ev.symbol}`}
      >
        {isDeleting ? '…' : '×'}
      </button>
    </div>
  );
}

// Full event detail row in the sidebar / agenda
function EventRow({ ev, onNews, onDelete, deletingId }) {
  const past = isPast(ev.date);
  const timeMeta = TIME_META[ev.time] || TIME_META.TBD;
  const colorIdx = ev.symbol.charCodeAt(0) % 6;
  const isDeleting = deletingId === ev.id;

  const dateObj = new Date(ev.date + 'T12:00:00');
  const displayDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className={`event-row ${past ? 'past' : ''} ${isDeleting ? 'deleting' : ''}`}>
      <div className="event-row-left">
        <CompanyLogo domain={ev.domain} symbol={ev.symbol} colorIndex={colorIdx} />
        <div className="event-row-info">
          <span className="event-row-symbol">{ev.symbol}</span>
          <span className="event-row-name">{ev.name !== ev.symbol ? ev.name : ''}</span>
        </div>
      </div>
      <div className="event-row-right">
        <span className="event-row-date">{displayDate}</span>
        <span className={`time-badge ${timeMeta.cls}`} title={timeMeta.title}>{timeMeta.label}</span>
        {ev.epsEstimated != null && (
          <span className="eps-chip">EPS est. ${Number(ev.epsEstimated).toFixed(2)}</span>
        )}
        <button className="event-row-news" onClick={() => onNews(ev.symbol, ev)} title="View news">
          📰
        </button>
        <button
          className="event-row-delete"
          onClick={() => onDelete(ev.id)}
          disabled={isDeleting}
          title="Remove"
        >
          {isDeleting ? '…' : '×'}
        </button>
      </div>
    </div>
  );
}

// Toast notification
function Toast({ toasts, onDismiss }) {
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => onDismiss(t.id)}>
          <span>{t.message}</span>
          <button className="toast-close" aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}



// ─── Price Chart ──────────────────────────────────────────────────────────────

function PriceChart({ ticker }) {
  const [range, setRange]   = useState('1mo');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/chart?symbol=${encodeURIComponent(ticker)}&range=${range}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.error) { setError(d.error); setLoading(false); return; }
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setError('Failed to load chart'); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [ticker, range]);

  const isUp = data ? data.change >= 0 : true;
  const color = isUp ? 'var(--green)' : 'var(--red)';

  return (
    <div className="chart-panel">
      <div className="chart-header">
        <div className="chart-price-info">
          {data && (
            <>
              <span className="chart-last">${data.lastPrice.toFixed(2)}</span>
              <span className="chart-change" style={{ color }}>
                {data.change >= 0 ? '+' : ''}{data.change.toFixed(2)}
                {' '}({data.changePct >= 0 ? '+' : ''}{data.changePct.toFixed(2)}%)
              </span>
              <span className="chart-currency">{data.currency}</span>
            </>
          )}
        </div>
        <div className="chart-range-tabs">
          {['5d', '1mo'].map(r => (
            <button
              key={r}
              className={`chart-range-btn ${range === r ? 'active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r === '5d' ? '5D' : '1M'}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-body">
        {loading && (
          <div className="chart-placeholder">
            <div className="mini-spinner" />
          </div>
        )}
        {error && !loading && (
          <div className="chart-placeholder chart-error">{error}</div>
        )}
        {data && !loading && (
          <ChartSVG data={data} color={color} />
        )}
      </div>
    </div>
  );
}

function ChartSVG({ data, color }) {
  const W = 600, H = 140;
  const PAD = { top: 12, right: 12, bottom: 24, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const { points, priceMin, priceMax } = data;
  if (!points.length) return null;

  // Add 2% padding so the line doesn't touch the edges
  const range = priceMax - priceMin || priceMin * 0.01;
  const yMin  = priceMin - range * 0.08;
  const yMax  = priceMax + range * 0.08;

  const xScale = i  => PAD.left + (i / (points.length - 1)) * innerW;
  const yScale = v  => PAD.top  + ((yMax - v) / (yMax - yMin)) * innerH;

  // Line path
  const linePts = points.map((p, i) => `${xScale(i).toFixed(1)},${yScale(p.c).toFixed(1)}`);
  const linePath = `M ${linePts.join(' L ')}`;

  // Fill path — close down to bottom of chart
  const lastX = xScale(points.length - 1).toFixed(1);
  const firstX = xScale(0).toFixed(1);
  const bottomY = (PAD.top + innerH).toFixed(1);
  const fillPath = `M ${firstX},${bottomY} L ${linePts.join(' L ')} L ${lastX},${bottomY} Z`;

  // Y-axis labels — 4 ticks
  const yTicks = [0, 0.33, 0.66, 1].map(pct => {
    const val = yMin + (yMax - yMin) * (1 - pct);
    return { val, y: yScale(val) };
  });

  // X-axis labels — pick ~4 evenly spaced timestamps
  const xStep = Math.max(1, Math.floor(points.length / 4));
  const xTicks = [];
  for (let i = 0; i < points.length; i += xStep) {
    const p = points[i];
    const d = new Date(p.t);
    const label = data.range === '5d'
      ? d.toLocaleDateString('en-US', { weekday: 'short' })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    xTicks.push({ x: xScale(i), label });
  }

  const gradId = `grad-${data.symbol}-${data.range}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0"    />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yTicks.map((t, i) => (
        <line
          key={i}
          x1={PAD.left} y1={t.y.toFixed(1)}
          x2={PAD.left + innerW} y2={t.y.toFixed(1)}
          stroke="var(--border-soft)" strokeWidth="1"
        />
      ))}

      {/* Fill */}
      <path d={fillPath} fill={`url(#${gradId})`} />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Y-axis labels */}
      {yTicks.map((t, i) => (
        <text
          key={i}
          x={PAD.left - 6} y={t.y + 4}
          textAnchor="end"
          fontSize="10"
          fill="var(--text-3)"
          fontFamily="var(--font-mono)"
        >
          {t.val >= 1000 ? `${(t.val / 1000).toFixed(1)}k` : t.val.toFixed(2)}
        </text>
      ))}

      {/* X-axis labels */}
      {xTicks.map((t, i) => (
        <text
          key={i}
          x={t.x} y={H - 4}
          textAnchor="middle"
          fontSize="10"
          fill="var(--text-3)"
          fontFamily="var(--font-mono)"
        >
          {t.label}
        </text>
      ))}

      {/* Last price dot */}
      <circle
        cx={xScale(points.length - 1).toFixed(1)}
        cy={yScale(points[points.length - 1].c).toFixed(1)}
        r="3.5"
        fill={color}
      />
    </svg>
  );
}

// ─── Related Tickers Panel ────────────────────────────────────────────────────

const REL_TYPE_META = {
  upstream:   { label: 'Upstream',   icon: '⬆', desc: 'Suppliers & input providers',     cls: 'rel-upstream' },
  downstream: { label: 'Downstream', icon: '⬇', desc: 'Customers & distribution chain',  cls: 'rel-downstream' },
  peer:       { label: 'Peers',      icon: '↔', desc: 'Direct competitors & comparables', cls: 'rel-peer' },
  adjacent:   { label: 'Adjacent',   icon: '◎', desc: 'Partners & ecosystem companies',   cls: 'rel-adjacent' },
};

function RelatedTickers({ relationships, loading, onAddTicker, trackedSymbols }) {
  const [activeType, setActiveType] = useState(null);

  if (loading) {
    return (
      <div className="rel-panel">
        <div className="rel-panel-header">
          <span className="rel-panel-title">Related Tickers</span>
        </div>
        <div className="rel-loading">
          <div className="mini-spinner" />
          <span>Analysing relationships…</span>
        </div>
      </div>
    );
  }

  if (!relationships) return null;

  const types = Object.keys(REL_TYPE_META).filter(
    t => relationships[t]?.length > 0
  );

  if (types.length === 0) {
    return (
      <div className="rel-panel">
        <div className="rel-panel-header">
          <span className="rel-panel-title">Related Tickers</span>
        </div>
        <div className="rel-empty">No relationship data available.</div>
      </div>
    );
  }

  const selected = activeType || types[0];
  const items = relationships[selected] || [];

  return (
    <div className="rel-panel">
      <div className="rel-panel-header">
        <span className="rel-panel-title">Related Tickers</span>
        <span className="rel-panel-sub">Click any ticker to add it to your calendar</span>
      </div>

      {/* Type tabs */}
      <div className="rel-tabs">
        {types.map(t => {
          const meta = REL_TYPE_META[t];
          return (
            <button
              key={t}
              className={"rel-tab " + (selected === t ? "active " : "") + meta.cls}
              onClick={() => setActiveType(t)}
              title={meta.desc}
            >
              <span className="rel-tab-icon">{meta.icon}</span>
              <span className="rel-tab-label">{meta.label}</span>
              <span className="rel-tab-count">{relationships[t].length}</span>
            </button>
          );
        })}
      </div>

      {/* Ticker grid */}
      <div className="rel-grid">
        {items.map((item, i) => {
          const alreadyTracked = trackedSymbols.has(item.symbol);
          const colorIdx = item.symbol.charCodeAt(0) % 6;
          return (
            <div key={i} className={"rel-card " + (alreadyTracked ? "tracked" : "")}>
              <div className="rel-card-top">
                <CompanyLogo
                  domain={domainFor(item.symbol)}
                  symbol={item.symbol}
                  colorIndex={colorIdx}
                />
                <span className="rel-card-symbol">{item.symbol}</span>
                {item.source === "fmp" && (
                  <span className="rel-source-badge">FMP</span>
                )}
              </div>
              {item.name && (
                <div className="rel-card-name">{item.name}</div>
              )}
              {item.reason && (
                <div className="rel-card-reason">{item.reason}</div>
              )}
              <button
                className={"rel-add-btn " + (alreadyTracked ? "tracked" : "")}
                onClick={() => !alreadyTracked && onAddTicker(item.symbol)}
                disabled={alreadyTracked}
                title={alreadyTracked ? "Already tracking" : "Add to calendar"}
              >
                {alreadyTracked ? "✓ Tracking" : "+ Add to calendar"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [viewDate, setViewDate]             = useState(null);
  const [mounted, setMounted]               = useState(false);
  const [view, setView]                     = useState('calendar'); // 'calendar' | 'agenda'
  const [events, setEvents]                 = useState([]);
  const [eventsLoading, setEventsLoading]   = useState(true);
  const [tickerInput, setTickerInput]       = useState('');
  const [addStep, setAddStep]               = useState(null); // null | 'fetching' | 'saving'
  const [deletingId, setDeletingId]         = useState(null);
  const [toasts, setToasts]                 = useState([]);
  const [newsState, setNewsState]           = useState(null); // null | { ticker, event, loading, articles }
  const [expandedCell, setExpandedCell]     = useState(null); // dateStr for overflow modal
  const inputRef                            = useRef(null);
  const toastCounter                        = useRef(0);

  useEffect(() => { setViewDate(new Date()); setMounted(true); }, []);
  useEffect(() => { if (status === 'unauthenticated') router.push('/auth/signin'); }, [status, router]);
  useEffect(() => { if (status === 'authenticated') loadEvents(); }, [status]);

  // ── Data ───────────────────────────────────────────────────────────────────

  async function loadEvents() {
    setEventsLoading(true);
    try {
      const res = await fetch('/api/events');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      pushToast('Failed to load events. Please refresh.', 'error', true);
    } finally {
      setEventsLoading(false);
    }
  }

  async function addTicker() {
    const ticker = tickerInput.trim().toUpperCase();
    if (!ticker) { inputRef.current?.focus(); return; }
    if (!/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(ticker)) {
      pushToast('Invalid format — try AAPL or BRK.B', 'error', true);
      return;
    }

    setAddStep('fetching');
    try {
      const res = await fetch(`/api/fetchEarnings?symbol=${encodeURIComponent(ticker)}`);
      const data = await res.json();
      if (!res.ok || !data.date) {
        pushToast(data.error || `No earnings date found for ${ticker}`, 'error', true);
        return;
      }

      setAddStep('saving');
      const postRes = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: ticker, name: data.name || ticker,
          date: data.date, time: data.time || 'TBD',
          domain: domainFor(ticker),
          epsEstimated: data.epsEstimated ?? null,
          source: data.source ?? null,
        }),
      });
      if (!postRes.ok) {
        const d = await postRes.json();
        pushToast(d.error || 'Failed to save', 'error', true);
        return;
      }
      const updated = await postRes.json();
      setEvents(updated);
      setTickerInput('');
      const tl = data.time && data.time !== 'TBD' ? ` · ${data.time}` : '';
      pushToast(`${ticker} added — ${data.date}${tl}`, 'success', false);

      // Jump calendar to the earnings month
      const earningsDate = new Date(data.date + 'T12:00:00');
      setViewDate(new Date(earningsDate.getFullYear(), earningsDate.getMonth(), 1));
    } catch (err) {
      pushToast(`Error: ${err.message}`, 'error', true);
    } finally {
      setAddStep(null);
    }
  }

  async function deleteEvent(eventId) {
    setDeletingId(eventId);
    try {
      const res = await fetch(`/api/events?id=${eventId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        pushToast(d.error || 'Failed to remove', 'error', true);
        return;
      }
      const remaining = await res.json();
      setEvents(remaining);
      pushToast('Event removed', 'info', false);
    } catch {
      pushToast('Failed to remove event', 'error', true);
    } finally {
      setDeletingId(null);
    }
  }

  // Add a ticker directly (from related tickers panel) without navigating calendar
  async function addTickerSilent(ticker) {
    if (!/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(ticker)) return;
    pushToast(`Fetching ${ticker}…`, 'info', false);
    try {
      const res = await fetch(`/api/fetchEarnings?symbol=${encodeURIComponent(ticker)}`);
      const data = await res.json();
      if (!res.ok || !data.date) {
        pushToast(data.error || `No earnings date for ${ticker}`, 'error', true);
        return;
      }
      const postRes = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: ticker, name: data.name || ticker,
          date: data.date, time: data.time || 'TBD',
          domain: domainFor(ticker),
          epsEstimated: data.epsEstimated ?? null,
          source: data.source ?? null,
        }),
      });
      if (!postRes.ok) { pushToast('Failed to save', 'error', true); return; }
      const updated = await postRes.json();
      setEvents(updated);
      pushToast(`${ticker} added — ${data.date}`, 'success', false);
    } catch (err) {
      pushToast(`Error: ${err.message}`, 'error', true);
    }
  }

  async function openNews(ticker, ev) {
    setNewsState({ ticker, event: ev, loading: true, articles: [], relLoading: true, relationships: null });

    const [newsRes, relRes] = await Promise.allSettled([
      fetch(`/api/news?symbol=${encodeURIComponent(ticker)}`),
      fetch(`/api/relationships?symbol=${encodeURIComponent(ticker)}`),
    ]);

    let articles = [];
    if (newsRes.status === 'fulfilled' && newsRes.value.ok) {
      const d = await newsRes.value.json();
      articles = d.news || [];
    }

    let relationships = null;
    if (relRes.status === 'fulfilled' && relRes.value.ok) {
      relationships = await relRes.value.json();
    }

    setNewsState(s => ({ ...s, loading: false, articles, relLoading: false, relationships }));
  }

  // ── Toasts ─────────────────────────────────────────────────────────────────

  function pushToast(message, type, sticky) {
    const id = ++toastCounter.current;
    setToasts(ts => [...ts, { id, message, type }]);
    if (!sticky) {
      setTimeout(() => dismissToast(id), 4000);
    }
  }

  function dismissToast(id) {
    setToasts(ts => ts.filter(t => t.id !== id));
  }

  // ── Calendar ───────────────────────────────────────────────────────────────

  function buildCalendarCells() {
    if (!viewDate) return [];
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));
    const totalDays = Math.round((endDate - startDate) / 86400000) + 1;

    const eventMap = {};
    events.forEach(ev => {
      if (!eventMap[ev.date]) eventMap[ev.date] = [];
      eventMap[ev.date].push(ev);
    });

    const today = todayStr();
    const cells = [];
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = fmtDate(date);
      const isOtherMonth = date.getMonth() !== month;
      const isToday = dateStr === today;
      const dayEvents = eventMap[dateStr] || [];
      const visible = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
      const overflow = dayEvents.length - MAX_VISIBLE_EVENTS;

      cells.push({ dateStr, date, isOtherMonth, isToday, dayEvents, visible, overflow });
    }
    return cells;
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const monthName = viewDate
    ? viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : '';

  const upcomingEvents = events
    .filter(ev => ev.date >= todayStr())
    .sort((a, b) => a.date.localeCompare(b.date));

  const pastEvents = events
    .filter(ev => ev.date < todayStr())
    .sort((a, b) => b.date.localeCompare(a.date));

  const calendarCells = buildCalendarCells();
  const trackedSymbols = new Set(events.map(e => e.symbol));

  // ── Render ─────────────────────────────────────────────────────────────────

  if (status === 'loading' || !mounted) {
    return (
      <div className="splash">
        <div className="splash-inner">
          <div className="splash-logo">EC</div>
          <div className="splash-spinner" />
        </div>
      </div>
    );
  }

  if (!session) return null;

  const isAdding = addStep !== null;

  return (
    <div className="app">

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">EC</span>
          <span className="brand-name">Earnings<br/>Calendar</span>
        </div>

        {/* Add ticker */}
        <div className="add-section">
          <div className={`add-input-wrap ${isAdding ? 'adding' : ''}`}>
            <input
              ref={inputRef}
              type="text"
              value={tickerInput}
              onChange={e => setTickerInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && addTicker()}
              placeholder="Ticker symbol…"
              disabled={isAdding}
              maxLength={8}
              className="add-input"
              aria-label="Stock ticker symbol"
            />
            <button
              onClick={addTicker}
              disabled={isAdding}
              className="add-btn"
              aria-label="Add ticker"
            >
              {isAdding ? (
                <span className="add-progress">
                  {addStep === 'fetching' ? 'Fetching…' : 'Saving…'}
                </span>
              ) : (
                <span className="add-icon">+</span>
              )}
            </button>
          </div>
          <p className="add-hint">e.g. NVDA, AAPL, BRK.B</p>
        </div>

        {/* Tracked list */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span>Upcoming</span>
            <span className="count-badge">{upcomingEvents.length}</span>
          </div>
          {eventsLoading ? (
            <div className="sidebar-loading">
              <div className="mini-spinner" />
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div className="sidebar-empty">
              <p>No upcoming earnings tracked.</p>
              <p>Add a ticker above to get started.</p>
            </div>
          ) : (
            <div className="sidebar-events">
              {upcomingEvents.map(ev => (
                <EventRow
                  key={ev.id}
                  ev={ev}
                  onNews={openNews}
                  onDelete={deleteEvent}
                  deletingId={deletingId}
                />
              ))}
            </div>
          )}
        </div>

        {pastEvents.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span>Past</span>
              <span className="count-badge muted">{pastEvents.length}</span>
            </div>
            <div className="sidebar-events">
              {pastEvents.map(ev => (
                <EventRow
                  key={ev.id}
                  ev={ev}
                  onNews={openNews}
                  onDelete={deleteEvent}
                  deletingId={deletingId}
                />
              ))}
            </div>
          </div>
        )}

        {/* User */}
        <div className="sidebar-user">
          {session.user?.image && (
            <img src={session.user.image} alt="" className="user-avatar" />
          )}
          <span className="user-name">{session.user?.name || session.user?.email}</span>
          <button onClick={() => signOut()} className="signout-btn" title="Sign out">→</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">

        {/* Top bar */}
        <div className="topbar">
          <div className="month-nav">
            <button
              className="nav-arrow"
              onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              aria-label="Previous month"
            >‹</button>
            <h1 className="month-title">{monthName}</h1>
            <button
              className="nav-arrow"
              onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              aria-label="Next month"
            >›</button>
          </div>
          <div className="topbar-right">
            <button
              className="today-chip"
              onClick={() => setViewDate(new Date())}
            >Today</button>
            <div className="view-toggle" role="group">
              <button
                className={`view-btn ${view === 'calendar' ? 'active' : ''}`}
                onClick={() => setView('calendar')}
                aria-pressed={view === 'calendar'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
                  <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
                </svg>
              </button>
              <button
                className={`view-btn ${view === 'agenda' ? 'active' : ''}`}
                onClick={() => setView('agenda')}
                aria-pressed={view === 'agenda'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/>
                  <rect x="1" y="12" width="14" height="2" rx="1"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Calendar view */}
        {view === 'calendar' && (
          <div className="calendar-wrap">
            {/* Weekday headers */}
            <div className="weekday-row">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="weekday-label">{d}</div>
              ))}
            </div>

            {eventsLoading ? (
              <div className="cal-loading">
                <div className="mini-spinner large" />
                <p>Loading your events…</p>
              </div>
            ) : (
              <>
                {/* Empty state */}
                {events.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-icon">📅</div>
                    <h2>Nothing tracked yet</h2>
                    <p>Enter a ticker symbol in the sidebar to start tracking earnings dates.</p>
                  </div>
                )}

                <div className="calendar-grid">
                  {calendarCells.map(({ dateStr, date, isOtherMonth, isToday, visible, overflow, dayEvents }) => (
                    <div
                      key={dateStr}
                      className={`cal-cell
                        ${isOtherMonth ? 'other-month' : ''}
                        ${isToday ? 'is-today' : ''}
                        ${dayEvents.length > 0 ? 'has-events' : ''}
                      `}
                    >
                      <div className="cell-date">
                        <span className={`date-num ${isToday ? 'today-num' : ''}`}>
                          {date.getDate()}
                        </span>
                      </div>
                      <div className="cell-events">
                        {visible.map(ev => (
                          <EventPill
                            key={ev.id}
                            ev={ev}
                            onNews={openNews}
                            onDelete={deleteEvent}
                            deletingId={deletingId}
                          />
                        ))}
                        {overflow > 0 && (
                          <button
                            className="overflow-btn"
                            onClick={() => setExpandedCell(dateStr)}
                          >
                            +{overflow} more
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Agenda view — mobile-first list of upcoming events */}
        {view === 'agenda' && (
          <div className="agenda-wrap">
            {eventsLoading ? (
              <div className="cal-loading">
                <div className="mini-spinner large" />
              </div>
            ) : events.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📅</div>
                <h2>Nothing tracked yet</h2>
                <p>Enter a ticker symbol in the sidebar to start tracking earnings dates.</p>
              </div>
            ) : (
              <>
                {upcomingEvents.length > 0 && (
                  <section className="agenda-section">
                    <h3 className="agenda-section-title">Upcoming</h3>
                    {upcomingEvents.map(ev => (
                      <EventRow key={ev.id} ev={ev} onNews={openNews} onDelete={deleteEvent} deletingId={deletingId} />
                    ))}
                  </section>
                )}
                {pastEvents.length > 0 && (
                  <section className="agenda-section">
                    <h3 className="agenda-section-title past-title">Past</h3>
                    {pastEvents.map(ev => (
                      <EventRow key={ev.id} ev={ev} onNews={openNews} onDelete={deleteEvent} deletingId={deletingId} />
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* ── Overflow cell modal ── */}
      {expandedCell && (() => {
        const cellEvents = events.filter(ev => ev.date === expandedCell);
        const d = new Date(expandedCell + 'T12:00:00');
        const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        return (
          <div className="modal-backdrop" onClick={() => setExpandedCell(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span>{label}</span>
                <button className="modal-close" onClick={() => setExpandedCell(null)}>×</button>
              </div>
              <div className="modal-body">
                {cellEvents.map(ev => (
                  <EventRow key={ev.id} ev={ev} onNews={(t, e) => { setExpandedCell(null); openNews(t, e); }} onDelete={deleteEvent} deletingId={deletingId} />
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── News modal ── */}
      {newsState && (
        <div className="modal-backdrop" onClick={() => setNewsState(null)}>
          <div className="modal-box news-modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="news-modal-title">
                {newsState.event && (
                  <CompanyLogo
                    domain={newsState.event.domain}
                    symbol={newsState.ticker}
                    colorIndex={newsState.ticker.charCodeAt(0) % 6}
                  />
                )}
                <span>{newsState.ticker} — News & Sentiment</span>
              </div>
              <button className="modal-close" onClick={() => setNewsState(null)}>×</button>
            </div>

            {/* Event detail strip */}
            {newsState.event && (
              <div className="news-event-strip">
                <span className="strip-date">
                  📅 {new Date(newsState.event.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
                {newsState.event.time && newsState.event.time !== 'TBD' && (
                  <span className={`time-badge ${(TIME_META[newsState.event.time] || TIME_META.TBD).cls}`}>
                    {(TIME_META[newsState.event.time] || TIME_META.TBD).label}
                  </span>
                )}
                {newsState.event.epsEstimated != null && (
                  <span className="eps-chip">EPS est. ${Number(newsState.event.epsEstimated).toFixed(2)}</span>
                )}
              </div>
            )}

            {/* Price chart */}
            <PriceChart ticker={newsState.ticker} />

            {/* Related tickers panel */}
            <RelatedTickers
              relationships={newsState.relationships}
              loading={newsState.relLoading}
              onAddTicker={addTickerSilent}
              trackedSymbols={trackedSymbols}
            />

            <div className="modal-body">
              {newsState.loading ? (
                <div className="modal-loading">
                  <div className="mini-spinner large" />
                  <p>Fetching latest news…</p>
                </div>
              ) : newsState.articles.length === 0 ? (
                <div className="modal-empty">No recent news found for {newsState.ticker}.</div>
              ) : (
                newsState.articles.map((item, i) => (
                  <div key={i} className="news-card">
                    <div className="news-card-meta">
                      <span className="news-source">{item.source}</span>
                      <span
                        className="sentiment-pill"
                        data-sentiment={item.sentiment}
                      >
                        {item.sentiment === 'positive' ? '↑' : item.sentiment === 'negative' ? '↓' : '–'} {item.sentiment}
                      </span>
                      <span className="news-date">{new Date(item.publishedAt).toLocaleDateString()}</span>
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="news-headline"
                    >
                      {item.headline}
                    </a>
                    {item.summary && item.summary !== item.headline && (
                      <p className="news-summary">{item.summary}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toasts ── */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
