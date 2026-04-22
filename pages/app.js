import { useEffect, useState, useRef } from 'react';
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
  BMO: { label: 'Pre-mkt',   title: 'Before Market Open',    cls: 'badge-bmo' },
  AMC: { label: 'After-mkt', title: 'After Market Close',    cls: 'badge-amc' },
  DMH: { label: 'Intraday',  title: 'During Market Hours',   cls: 'badge-dmh' },
  TBD: { label: 'TBD',       title: 'Time Not Confirmed',    cls: 'badge-tbd' },
};

const REL_TYPE_META = {
  upstream:   { label: 'Upstream',   icon: '⬆', desc: 'Suppliers & input providers',      cls: 'rel-upstream'   },
  downstream: { label: 'Downstream', icon: '⬇', desc: 'Customers & distribution chain',   cls: 'rel-downstream' },
  peer:       { label: 'Peers',      icon: '↔', desc: 'Direct competitors & comparables',  cls: 'rel-peer'       },
  adjacent:   { label: 'Adjacent',   icon: '◎', desc: 'Partners & ecosystem companies',    cls: 'rel-adjacent'   },
};

const MAX_VISIBLE_EVENTS = 3;

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

// ─── CompanyLogo ──────────────────────────────────────────────────────────────

function CompanyLogo({ domain, symbol, colorIndex }) {
  const colors = [
    ['#3b82f6','#1d4ed8'], ['#8b5cf6','#6d28d9'], ['#ec4899','#be185d'],
    ['#10b981','#065f46'], ['#f59e0b','#92400e'], ['#06b6d4','#0e7490'],
  ];
  const [c1, c2] = colors[colorIndex % colors.length];
  const [src, setSrc]             = useState(`/api/logo?domain=${encodeURIComponent(domain)}`);
  const [useFallback, setFallback] = useState(false);

  function handleError() {
    if (src.startsWith('/api/logo')) {
      setSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
    } else {
      setFallback(true);
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

// ─── EventPill ────────────────────────────────────────────────────────────────

function EventPill({ ev, onNews, onDelete, deletingId }) {
  const isDeleting = deletingId === ev.id;
  const past       = isPast(ev.date);
  const timeMeta   = TIME_META[ev.time] || TIME_META.TBD;
  const colorIdx   = ev.symbol.charCodeAt(0) % 6;

  return (
    <div
      className={`event-pill ${past ? 'past' : ''} ${isDeleting ? 'deleting' : ''}`}
      onClick={() => !isDeleting && onNews(ev.symbol, ev)}
      role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onNews(ev.symbol, ev)}
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
      >
        {isDeleting ? '…' : '×'}
      </button>
    </div>
  );
}

// ─── EventRow (sidebar) ───────────────────────────────────────────────────────

function EventRow({ ev, onNews, onDelete, deletingId, position, editingSymbol, onEditPosition, onSavePosition, onDeletePosition }) {
  const past        = isPast(ev.date);
  const timeMeta    = TIME_META[ev.time] || TIME_META.TBD;
  const colorIdx    = ev.symbol.charCodeAt(0) % 6;
  const isDeleting  = deletingId === ev.id;
  const isEditing   = editingSymbol === ev.symbol;
  const dateObj     = new Date(ev.date + 'T12:00:00');
  const displayDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className={`event-row-wrap ${isEditing ? 'editing' : ''}`}>
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
          {/* Position chip — free feature */}
          <PositionChip
            position={position}
            onEdit={() => onEditPosition(isEditing ? null : ev.symbol)}
          />
          <button className="event-row-news" onClick={() => onNews(ev.symbol, ev)} title="View news">📰</button>
          <button className="event-row-delete" onClick={() => onDelete(ev.id)} disabled={isDeleting}>
            {isDeleting ? '…' : '×'}
          </button>
        </div>
      </div>
      {/* Inline position form */}
      {isEditing && (
        <PositionForm
          symbol={ev.symbol}
          existing={position}
          onSave={onSavePosition}
          onDelete={onDeletePosition}
          onCancel={() => onEditPosition(null)}
        />
      )}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

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

// ─── PremiumGate ──────────────────────────────────────────────────────────────

function PremiumGate({ onUpgrade }) {
  return (
    <div className="premium-gate">
      <div className="premium-gate-icon">⭐</div>
      <h3>Premium Feature</h3>
      <p>Upgrade to see price charts, related tickers, and vote on relationship data.</p>
      <button className="premium-gate-btn" onClick={onUpgrade}>
        Upgrade for $0.99 / month
      </button>
    </div>
  );
}

// ─── PriceChart ───────────────────────────────────────────────────────────────

function PriceChart({ ticker }) {
  const [range, setRange]     = useState('1mo');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setData(null);
    fetch(`/api/chart?symbol=${encodeURIComponent(ticker)}&range=${range}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.error) { setError(d.error); setLoading(false); return; }
        setData(d); setLoading(false);
      })
      .catch(() => { if (!cancelled) { setError('Failed to load chart'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ticker, range]);

  const isUp  = data ? data.change >= 0 : true;
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
            <button key={r} className={`chart-range-btn ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>
              {r === '5d' ? '5D' : '1M'}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-body">
        {loading && <div className="chart-placeholder"><div className="mini-spinner" /></div>}
        {error && !loading && <div className="chart-placeholder chart-error">{error}</div>}
        {data && !loading && <ChartSVG data={data} color={color} />}
      </div>
    </div>
  );
}

function ChartSVG({ data, color }) {
  const W = 600, H = 140;
  const PAD = { top: 12, right: 12, bottom: 24, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top  - PAD.bottom;
  const { points, priceMin, priceMax } = data;
  if (!points.length) return null;

  const range  = priceMax - priceMin || priceMin * 0.01;
  const yMin   = priceMin - range * 0.08;
  const yMax   = priceMax + range * 0.08;
  const xScale = i => PAD.left + (i / (points.length - 1)) * innerW;
  const yScale = v => PAD.top  + ((yMax - v) / (yMax - yMin)) * innerH;

  const linePts  = points.map((p, i) => `${xScale(i).toFixed(1)},${yScale(p.c).toFixed(1)}`);
  const linePath = `M ${linePts.join(' L ')}`;
  const lastX    = xScale(points.length - 1).toFixed(1);
  const firstX   = xScale(0).toFixed(1);
  const bottomY  = (PAD.top + innerH).toFixed(1);
  const fillPath = `M ${firstX},${bottomY} L ${linePts.join(' L ')} L ${lastX},${bottomY} Z`;

  const yTicks = [0, 0.33, 0.66, 1].map(pct => ({
    val: yMin + (yMax - yMin) * (1 - pct),
    y:   yScale(yMin + (yMax - yMin) * (1 - pct)),
  }));

  const xStep  = Math.max(1, Math.floor(points.length / 4));
  const xTicks = [];
  for (let i = 0; i < points.length; i += xStep) {
    const d     = new Date(points[i].t);
    const label = data.range === '5d'
      ? d.toLocaleDateString('en-US', { weekday: 'short' })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    xTicks.push({ x: xScale(i), label });
  }

  const gradId = `grad-${data.symbol}-${data.range}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0"    />
        </linearGradient>
      </defs>
      {yTicks.map((t, i) => (
        <line key={i} x1={PAD.left} y1={t.y.toFixed(1)} x2={PAD.left + innerW} y2={t.y.toFixed(1)}
          stroke="var(--border-soft)" strokeWidth="1" />
      ))}
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {yTicks.map((t, i) => (
        <text key={i} x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize="10"
          fill="var(--text-3)" fontFamily="var(--font-mono)">
          {t.val >= 1000 ? `${(t.val / 1000).toFixed(1)}k` : t.val.toFixed(2)}
        </text>
      ))}
      {xTicks.map((t, i) => (
        <text key={i} x={t.x} y={H - 4} textAnchor="middle" fontSize="10"
          fill="var(--text-3)" fontFamily="var(--font-mono)">
          {t.label}
        </text>
      ))}
      <circle cx={xScale(points.length - 1).toFixed(1)} cy={yScale(points[points.length - 1].c).toFixed(1)}
        r="3.5" fill={color} />
    </svg>
  );
}

// ─── RelatedTickers ───────────────────────────────────────────────────────────

function RelatedTickers({ relationships, userVotes, loading, onAddTicker, onVote, onSuggest, trackedSymbols }) {
  const [activeType, setActiveType]         = useState(null);
  const [suggestOpen, setSuggestOpen]       = useState(false);
  const [suggest, setSuggest]               = useState({ toSymbol: '', relType: 'peer', reason: '' });
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [votingId, setVotingId]             = useState(null);

  if (loading) {
    return (
      <div className="rel-panel">
        <div className="rel-panel-header"><span className="rel-panel-title">Related Tickers</span></div>
        <div className="rel-loading"><div className="mini-spinner" /><span>Analysing relationships…</span></div>
      </div>
    );
  }

  if (!relationships) return null;

  const types    = Object.keys(REL_TYPE_META).filter(t => relationships[t]?.length > 0);
  const selected = activeType || types[0];
  const items    = selected ? (relationships[selected] || []) : [];

  async function handleVote(edgeId, vote) {
    setVotingId(edgeId);
    await onVote(edgeId, vote);
    setVotingId(null);
  }

  async function handleSuggest() {
    if (!suggest.toSymbol) return;
    setSuggestLoading(true);
    await onSuggest(suggest);
    setSuggestLoading(false);
    setSuggestOpen(false);
    setSuggest({ toSymbol: '', relType: 'peer', reason: '' });
  }

  return (
    <div className="rel-panel">
      <div className="rel-panel-header">
        <span className="rel-panel-title">Related Tickers</span>
        <div className="rel-panel-actions">
          <span className="rel-panel-sub">Click any ticker to add it</span>
          <button className="rel-suggest-trigger" onClick={() => setSuggestOpen(s => !s)}>
            + Suggest
          </button>
        </div>
      </div>

      {/* Suggest form */}
      {suggestOpen && (
        <div className="rel-suggest-form">
          <input
            className="rel-suggest-input"
            placeholder="Ticker (e.g. ASML)"
            value={suggest.toSymbol}
            onChange={e => setSuggest(s => ({ ...s, toSymbol: e.target.value.toUpperCase() }))}
            maxLength={8}
          />
          <select
            className="rel-suggest-select"
            value={suggest.relType}
            onChange={e => setSuggest(s => ({ ...s, relType: e.target.value }))}
          >
            {Object.entries(REL_TYPE_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <input
            className="rel-suggest-reason"
            placeholder="Reason (optional)"
            value={suggest.reason}
            onChange={e => setSuggest(s => ({ ...s, reason: e.target.value }))}
          />
          <button className="rel-suggest-submit" onClick={handleSuggest} disabled={suggestLoading || !suggest.toSymbol}>
            {suggestLoading ? '…' : 'Submit'}
          </button>
        </div>
      )}

      {types.length === 0 ? (
        <div className="rel-empty">No relationship data available yet.</div>
      ) : (
        <>
          <div className="rel-tabs">
            {types.map(t => {
              const meta = REL_TYPE_META[t];
              return (
                <button
                  key={t}
                  className={`rel-tab ${selected === t ? 'active' : ''} ${meta.cls}`}
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

          <div className="rel-grid">
            {items.map((item, i) => {
              const alreadyTracked = trackedSymbols.has(item.symbol);
              const colorIdx       = item.symbol.charCodeAt(0) % 6;
              const userVote       = userVotes?.[item.id];
              const conf           = Math.round((item.confidence ?? 0) * 100);

              return (
                <div key={i} className={`rel-card ${alreadyTracked ? 'tracked' : ''}`}>
                  <div className="rel-card-top">
                    <CompanyLogo domain={domainFor(item.symbol)} symbol={item.symbol} colorIndex={colorIdx} />
                    <span className="rel-card-symbol">{item.symbol}</span>
                    <span className="rel-confidence" title="Confidence score">{conf}%</span>
                    {item.source === 'fmp' && <span className="rel-source-badge">FMP</span>}
                    {item.source === 'admin' && <span className="rel-source-badge admin">✓</span>}
                  </div>

                  {item.reason && <div className="rel-card-reason">{item.reason}</div>}

                  <div className="rel-card-footer">
                    {/* Vote buttons */}
                    <div className="rel-vote-row">
                      <button
                        className={`rel-vote-btn up ${userVote === 1 ? 'voted' : ''}`}
                        onClick={() => handleVote(item.id, userVote === 1 ? 0 : 1)}
                        disabled={votingId === item.id}
                        title="Mark as correct"
                      >
                        👍 {item.voteUp}
                      </button>
                      <button
                        className={`rel-vote-btn down ${userVote === -1 ? 'voted' : ''}`}
                        onClick={() => handleVote(item.id, userVote === -1 ? 0 : -1)}
                        disabled={votingId === item.id}
                        title="Mark as incorrect"
                      >
                        👎 {item.voteDown}
                      </button>
                    </div>

                    <button
                      className={`rel-add-btn ${alreadyTracked ? 'tracked' : ''}`}
                      onClick={() => !alreadyTracked && onAddTicker(item.symbol)}
                      disabled={alreadyTracked}
                    >
                      {alreadyTracked ? '✓ Tracking' : '+ Add'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}


// ─── PositionChip ─────────────────────────────────────────────────────────────
// Free users see this on the sidebar EventRow

function PositionChip({ position, onEdit }) {
  if (!position) {
    return (
      <button className="pos-add-btn" onClick={e => { e.stopPropagation(); onEdit(); }} title="Add position">
        + Position
      </button>
    );
  }

  const totalCost = position.quantity * position.avgCost;

  return (
    <div className="pos-chip" onClick={e => { e.stopPropagation(); onEdit(); }} title="Edit position">
      <span className="pos-chip-qty">{position.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })} sh</span>
      <span className="pos-chip-sep">@</span>
      <span className="pos-chip-cost">${position.avgCost.toFixed(2)}</span>
    </div>
  );
}

// ─── PositionForm ─────────────────────────────────────────────────────────────
// Inline add/edit form shown below the event row

function PositionForm({ symbol, existing, onSave, onDelete, onCancel }) {
  const [qty,  setQty]  = useState(existing?.quantity?.toString() ?? '');
  const [cost, setCost] = useState(existing?.avgCost?.toString()  ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!qty || !cost) return;
    setSaving(true);
    await onSave({ symbol, quantity: qty, avgCost: cost });
    setSaving(false);
  }

  async function handleDelete() {
    setDeleting(true);
    await onDelete(symbol);
    setDeleting(false);
  }

  return (
    <div className="pos-form" onClick={e => e.stopPropagation()}>
      <div className="pos-form-row">
        <div className="pos-form-field">
          <label className="pos-form-label">Shares</label>
          <input
            className="pos-form-input"
            type="number"
            min="0"
            step="any"
            placeholder="100"
            value={qty}
            onChange={e => setQty(e.target.value)}
            autoFocus
          />
        </div>
        <div className="pos-form-field">
          <label className="pos-form-label">Avg cost (USD)</label>
          <input
            className="pos-form-input"
            type="number"
            min="0"
            step="any"
            placeholder="150.00"
            value={cost}
            onChange={e => setCost(e.target.value)}
          />
        </div>
      </div>
      <div className="pos-form-actions">
        <button className="pos-form-save" onClick={handleSave} disabled={saving || !qty || !cost}>
          {saving ? 'Saving…' : existing ? 'Update' : 'Save'}
        </button>
        {existing && (
          <button className="pos-form-delete" onClick={handleDelete} disabled={deleting}>
            {deleting ? '…' : 'Remove'}
          </button>
        )}
        <button className="pos-form-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── PositionCard ─────────────────────────────────────────────────────────────
// Premium modal card showing full P&L breakdown

function PositionCard({ position, symbol, lastPrice, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);

  if (!position && !editing) {
    return (
      <div className="pos-card pos-card-empty">
        <span className="pos-card-empty-label">No position tracked</span>
        <button className="pos-card-add-btn" onClick={() => setEditing(true)}>+ Add position</button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="pos-card">
        <div className="pos-card-header">
          <span className="pos-card-title">Position — {symbol}</span>
        </div>
        <PositionForm
          symbol={symbol}
          existing={position}
          onSave={async data => { await onEdit(data); setEditing(false); }}
          onDelete={async sym => { await onDelete(sym); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const totalCost    = position.quantity * position.avgCost;
  const currentValue = lastPrice ? position.quantity * lastPrice : null;
  const pnl          = currentValue != null ? currentValue - totalCost : null;
  const pnlPct       = pnl != null ? (pnl / totalCost) * 100 : null;
  const isUp         = pnl != null ? pnl >= 0 : null;

  return (
    <div className="pos-card">
      <div className="pos-card-header">
        <span className="pos-card-title">Your Position</span>
        <button className="pos-card-edit-btn" onClick={() => setEditing(true)}>Edit</button>
      </div>

      <div className="pos-metrics">
        <div className="pos-metric">
          <span className="pos-metric-label">Shares</span>
          <span className="pos-metric-value">
            {position.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}
          </span>
        </div>
        <div className="pos-metric">
          <span className="pos-metric-label">Avg cost</span>
          <span className="pos-metric-value">${position.avgCost.toFixed(2)}</span>
        </div>
        <div className="pos-metric">
          <span className="pos-metric-label">Cost basis</span>
          <span className="pos-metric-value">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        {currentValue != null && (
          <div className="pos-metric">
            <span className="pos-metric-label">Market value</span>
            <span className="pos-metric-value">${currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
        {pnl != null && (
          <div className="pos-metric pos-metric-pnl">
            <span className="pos-metric-label">Unrealized P&L</span>
            <span className="pos-metric-value" style={{ color: isUp ? 'var(--green)' : 'var(--red)' }}>
              {isUp ? '+' : ''}{pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="pos-pnl-pct">
                ({isUp ? '+' : ''}{pnlPct.toFixed(2)}%)
              </span>
            </span>
          </div>
        )}
        {lastPrice == null && (
          <div className="pos-metric-note">Open the chart to see live P&L</div>
        )}
      </div>
    </div>
  );
}

// ─── SentimentSummary ─────────────────────────────────────────────────────────

function SentimentSummary({ articles }) {
  if (!articles || articles.length < 2) return null;

  const counts = { positive: 0, neutral: 0, negative: 0 };
  let totalScore = 0;
  let scoredCount = 0;

  articles.forEach(a => {
    const s = a.sentiment || 'neutral';
    if (counts[s] !== undefined) counts[s]++;
    if (typeof a.sentimentScore === 'number') {
      totalScore += a.sentimentScore;
      scoredCount++;
    }
  });

  const avgScore  = scoredCount > 0 ? totalScore / scoredCount : 0;
  const total     = articles.length;
  const pctPos    = Math.round((counts.positive / total) * 100);
  const pctNeu    = Math.round((counts.neutral  / total) * 100);
  const pctNeg    = Math.round((counts.negative / total) * 100);

  // Gauge: map avgScore (-1 to 1) to a 0-100 position
  const gaugePos  = Math.round(((avgScore + 1) / 2) * 100);

  let overallLabel, overallColor;
  if (avgScore >  0.2) { overallLabel = 'Bullish';  overallColor = '#10b981'; }
  else if (avgScore < -0.2) { overallLabel = 'Bearish';  overallColor = '#ef4444'; }
  else                      { overallLabel = 'Neutral';  overallColor = '#94a3b8'; }

  return (
    <div className="sentiment-summary">
      <div className="sentiment-summary-header">
        <span className="sentiment-summary-label">News Sentiment</span>
        <span className="sentiment-overall-badge" style={{ color: overallColor, borderColor: overallColor }}>
          {overallLabel}
        </span>
      </div>

      {/* Gauge bar */}
      <div className="sentiment-gauge-wrap">
        <span className="sentiment-gauge-end bear">Bearish</span>
        <div className="sentiment-gauge-track">
          {/* Coloured fill from center */}
          <div
            className="sentiment-gauge-fill"
            style={{
              left:       avgScore >= 0 ? '50%' : `${gaugePos}%`,
              width:      `${Math.abs(avgScore) * 50}%`,
              background: overallColor,
            }}
          />
          {/* Center line */}
          <div className="sentiment-gauge-center" />
          {/* Needle */}
          <div className="sentiment-gauge-needle" style={{ left: `${gaugePos}%` }} />
        </div>
        <span className="sentiment-gauge-end bull">Bullish</span>
      </div>

      {/* Article breakdown */}
      <div className="sentiment-breakdown">
        {/* Stacked bar */}
        <div className="sentiment-bar-wrap">
          {pctPos > 0 && (
            <div className="sentiment-bar-seg pos" style={{ width: `${pctPos}%` }} title={`${counts.positive} positive`} />
          )}
          {pctNeu > 0 && (
            <div className="sentiment-bar-seg neu" style={{ width: `${pctNeu}%` }} title={`${counts.neutral} neutral`} />
          )}
          {pctNeg > 0 && (
            <div className="sentiment-bar-seg neg" style={{ width: `${pctNeg}%` }} title={`${counts.negative} negative`} />
          )}
        </div>

        {/* Legend */}
        <div className="sentiment-legend">
          <span className="sentiment-legend-item pos">
            <span className="sentiment-legend-dot" />
            {counts.positive} positive
          </span>
          <span className="sentiment-legend-item neu">
            <span className="sentiment-legend-dot" />
            {counts.neutral} neutral
          </span>
          <span className="sentiment-legend-item neg">
            <span className="sentiment-legend-dot" />
            {counts.negative} negative
          </span>
          <span className="sentiment-legend-total">
            {total} articles
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [viewDate, setViewDate]           = useState(null);
  const [mounted, setMounted]             = useState(false);
  const [view, setView]                   = useState('calendar');
  const [events, setEvents]               = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [tickerInput, setTickerInput]     = useState('');
  const [addStep, setAddStep]             = useState(null);
  const [deletingId, setDeletingId]       = useState(null);
  const [toasts, setToasts]               = useState([]);
  const [newsState, setNewsState]         = useState(null);
  const [expandedCell, setExpandedCell]   = useState(null);

  // Subscription
  const [isPremium, setIsPremium]         = useState(false);
  const [subLoading, setSubLoading]       = useState(true);

  // Positions
  const [positions, setPositions]         = useState({});  // symbol → position
  const [editingPosition, setEditingPosition] = useState(null); // symbol being edited in sidebar

  const inputRef     = useRef(null);
  const toastCounter = useRef(0);

  useEffect(() => { setViewDate(new Date()); setMounted(true); }, []);
  useEffect(() => { if (status === 'unauthenticated') { router.push('/auth/signin?callbackUrl=/app'); return; } }, [status, router]);
  useEffect(() => {
    if (status === 'authenticated') {
      loadEvents();
      loadSubStatus();
      loadPositions();
    }
  }, [status]);

  // Handle ?subscribed=1 redirect from Stripe
  useEffect(() => {
    if (router.query.subscribed === '1') {
      pushToast('Welcome to Premium! 🎉', 'success', false);
      setIsPremium(true);
      router.replace('/app', undefined, { shallow: true });
    }
  }, [router.query.subscribed]);

  // ── Data ───────────────────────────────────────────────────────────────────

  async function loadSubStatus() {
    setSubLoading(true);
    try {
      const res  = await fetch('/api/stripe/status');
      const data = await res.json();
      setIsPremium(data.isPremium ?? false);
    } catch {
      setIsPremium(false);
    } finally {
      setSubLoading(false);
    }
  }

  async function loadPositions() {
    try {
      const res  = await fetch('/api/positions');
      if (!res.ok) return;
      const data = await res.json();
      // Build symbol → position map for O(1) lookup
      const map  = {};
      data.forEach(p => { map[p.symbol] = p; });
      setPositions(map);
    } catch (err) {
      console.error('loadPositions error:', err);
    }
  }

  async function savePosition({ symbol, quantity, avgCost }) {
    try {
      const res = await fetch('/api/positions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ symbol, quantity, avgCost }),
      });
      if (!res.ok) { pushToast('Failed to save position', 'error', true); return; }
      const pos = await res.json();
      setPositions(prev => ({ ...prev, [pos.symbol]: pos }));
      setEditingPosition(null);
      pushToast(`Position saved for ${symbol}`, 'success', false);
    } catch {
      pushToast('Failed to save position', 'error', true);
    }
  }

  async function deletePosition(symbol) {
    try {
      const res = await fetch(`/api/positions?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      if (!res.ok) { pushToast('Failed to remove position', 'error', true); return; }
      setPositions(prev => { const n = { ...prev }; delete n[symbol]; return n; });
      setEditingPosition(null);
      pushToast(`Position removed for ${symbol}`, 'info', false);
    } catch {
      pushToast('Failed to remove position', 'error', true);
    }
  }

  async function loadEvents() {
    setEventsLoading(true);
    try {
      const res  = await fetch('/api/events');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      pushToast('Failed to load events. Please refresh.', 'error', true);
    } finally {
      setEventsLoading(false);
    }
  }

  async function addTicker(tickerOverride) {
    const ticker = (tickerOverride || tickerInput).trim().toUpperCase();
    if (!ticker) { inputRef.current?.focus(); return; }
    if (!/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(ticker)) {
      pushToast('Invalid format — try AAPL or BRK.B', 'error', true);
      return;
    }

    setAddStep('fetching');
    try {
      const res  = await fetch(`/api/fetchEarnings?symbol=${encodeURIComponent(ticker)}`);
      const data = await res.json();
      if (!res.ok || !data.date) {
        pushToast(data.error || `No earnings date found for ${ticker}`, 'error', true);
        return;
      }

      setAddStep('saving');
      const postRes = await fetch('/api/events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
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
      if (!tickerOverride) setTickerInput('');
      const tl = data.time && data.time !== 'TBD' ? ` · ${data.time}` : '';
      pushToast(`${ticker} added — ${data.date}${tl}`, 'success', false);
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
      if (!res.ok) { const d = await res.json(); pushToast(d.error || 'Failed to remove', 'error', true); return; }
      const remaining = await res.json();
      setEvents(remaining);
      pushToast('Event removed', 'info', false);
    } catch {
      pushToast('Failed to remove event', 'error', true);
    } finally {
      setDeletingId(null);
    }
  }

  async function openNews(ticker, ev) {
    setNewsState({ ticker, event: ev, loading: true, articles: [], relLoading: true, relationships: null, userVotes: {}, lastPrice: null });

    const [newsRes, relRes] = await Promise.allSettled([
      fetch(`/api/news?symbol=${encodeURIComponent(ticker)}`),
      isPremium ? fetch(`/api/relationships?symbol=${encodeURIComponent(ticker)}`) : Promise.resolve(null),
    ]);

    let articles = [];
    if (newsRes.status === 'fulfilled' && newsRes.value?.ok) {
      const d = await newsRes.value.json();
      articles = d.news || [];
    }

    let relationships = null;
    let userVotes     = {};
    if (isPremium && relRes.status === 'fulfilled' && relRes.value?.ok) {
      const d   = await relRes.value.json();
      userVotes = d.userVotes || {};
      const { userVotes: _uv, cached: _c, ...grouped } = d;
      relationships = grouped;
    }

    setNewsState(s => ({ ...s, loading: false, articles, relLoading: false, relationships, userVotes }));

    // Fetch last price for P&L calculation (premium — chart API already called by PriceChart,
    // but we need it here for PositionCard before the chart renders)
    if (isPremium) {
      try {
        const priceRes = await fetch(`/api/chart?symbol=${encodeURIComponent(ticker)}&range=5d`);
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          setNewsState(s => ({ ...s, lastPrice: priceData.lastPrice ?? null }));
        }
      } catch { /* non-fatal */ }
    }
  }

  async function handleVote(edgeId, vote) {
    if (vote === 0) return; // toggle off — no-op for now
    try {
      await fetch('/api/relationships/vote', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ edgeId, vote }),
      });
      // Optimistic update of userVotes in newsState
      setNewsState(s => ({
        ...s,
        userVotes: { ...s.userVotes, [edgeId]: vote },
      }));
    } catch {
      pushToast('Failed to record vote', 'error', true);
    }
  }

  async function handleSuggest(suggest) {
    if (!newsState?.ticker) return;
    try {
      const res = await fetch('/api/relationships/suggest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fromSymbol: newsState.ticker,
          toSymbol:   suggest.toSymbol,
          relType:    suggest.relType,
          reason:     suggest.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) { pushToast(data.error || 'Failed to submit', 'error', true); return; }
      pushToast('Suggestion submitted for review — thanks!', 'success', false);
    } catch {
      pushToast('Failed to submit suggestion', 'error', true);
    }
  }

  async function handleBillingPortal() {
    try {
      const res  = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      pushToast('Failed to open billing portal', 'error', true);
    }
  }

  // ── Toasts ─────────────────────────────────────────────────────────────────

  function pushToast(message, type, sticky) {
    const id = ++toastCounter.current;
    setToasts(ts => [...ts, { id, message, type }]);
    if (!sticky) setTimeout(() => dismissToast(id), 4000);
  }

  function dismissToast(id) { setToasts(ts => ts.filter(t => t.id !== id)); }

  // ── Calendar ───────────────────────────────────────────────────────────────

  function buildCalendarCells() {
    if (!viewDate) return [];
    const year  = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay  = new Date(year, month, 1);
    const lastDay   = new Date(year, month + 1, 0);
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
    return Array.from({ length: totalDays }, (_, i) => {
      const date      = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr   = fmtDate(date);
      const dayEvents = eventMap[dateStr] || [];
      return {
        dateStr, date,
        isOtherMonth: date.getMonth() !== month,
        isToday:      dateStr === today,
        dayEvents,
        visible:  dayEvents.slice(0, MAX_VISIBLE_EVENTS),
        overflow: dayEvents.length - MAX_VISIBLE_EVENTS,
      };
    });
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const monthName      = viewDate ? viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }) : '';
  const upcomingEvents = events.filter(ev => ev.date >= todayStr()).sort((a, b) => a.date.localeCompare(b.date));
  const pastEvents     = events.filter(ev => ev.date < todayStr()).sort((a, b) => b.date.localeCompare(a.date));
  const calendarCells  = buildCalendarCells();
  const trackedSymbols = new Set(events.map(e => e.symbol));
  const isAdding       = addStep !== null;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (status === 'loading' || !mounted) {
    return (
      <div className="splash">
        <div className="splash-inner">
          <div className="splash-logo">WF</div>
          <div className="splash-spinner" />
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="app">

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">WF</span>
          <span className="brand-name">Earnings<br/>Calendar</span>
        </div>

        {/* Premium badge / upgrade prompt */}
        {!subLoading && (
          isPremium ? (
            <div className="premium-badge" onClick={handleBillingPortal} title="Manage subscription">
              <span className="premium-star">⭐</span>
              <span>Premium</span>
            </div>
          ) : (
            <button className="upgrade-prompt" onClick={() => router.push('/subscribe')}>
              <span className="upgrade-star">⭐</span>
              <span>Upgrade to Premium</span>
              <span className="upgrade-price">$0.99/mo</span>
            </button>
          )
        )}

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
            />
            <button onClick={() => addTicker()} disabled={isAdding} className="add-btn">
              {isAdding
                ? <span className="add-progress">{addStep === 'fetching' ? 'Fetching…' : 'Saving…'}</span>
                : <span className="add-icon">+</span>
              }
            </button>
          </div>
          <p className="add-hint">e.g. NVDA, AAPL, BRK.B</p>
        </div>

        {/* Upcoming events */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span>Upcoming</span>
            <span className="count-badge">{upcomingEvents.length}</span>
          </div>
          {eventsLoading ? (
            <div className="sidebar-loading"><div className="mini-spinner" /></div>
          ) : upcomingEvents.length === 0 ? (
            <div className="sidebar-empty">
              <p>No upcoming earnings tracked.</p>
              <p>Add a ticker above to get started.</p>
            </div>
          ) : (
            <div className="sidebar-events">
              {upcomingEvents.map(ev => (
                <EventRow key={ev.id} ev={ev} onNews={openNews} onDelete={deleteEvent} deletingId={deletingId}
                  position={positions[ev.symbol]}
                  editingSymbol={editingPosition}
                  onEditPosition={setEditingPosition}
                  onSavePosition={savePosition}
                  onDeletePosition={deletePosition}
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
                <EventRow key={ev.id} ev={ev} onNews={openNews} onDelete={deleteEvent} deletingId={deletingId}
                  position={positions[ev.symbol]}
                  editingSymbol={editingPosition}
                  onEditPosition={setEditingPosition}
                  onSavePosition={savePosition}
                  onDeletePosition={deletePosition}
                />
              ))}
            </div>
          </div>
        )}

        {/* User */}
        <div className="sidebar-user">
          {session.user?.image && <img src={session.user.image} alt="" className="user-avatar" />}
          <span className="user-name">{session.user?.name || session.user?.email}</span>
          <button onClick={() => signOut()} className="signout-btn" title="Sign out">→</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        <div className="topbar">
          <div className="month-nav">
            <button className="nav-arrow"
              onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</button>
            <h1 className="month-title">{monthName}</h1>
            <button className="nav-arrow"
              onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="topbar-right">
            <button className="today-chip" onClick={() => setViewDate(new Date())}>Today</button>
            <div className="view-toggle" role="group">
              <button className={`view-btn ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
                  <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
                </svg>
              </button>
              <button className={`view-btn ${view === 'agenda' ? 'active' : ''}`} onClick={() => setView('agenda')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/>
                  <rect x="1" y="12" width="14" height="2" rx="1"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {view === 'calendar' && (
          <div className="calendar-wrap">
            <div className="weekday-row">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="weekday-label">{d}</div>
              ))}
            </div>
            {eventsLoading ? (
              <div className="cal-loading"><div className="mini-spinner large" /><p>Loading your events…</p></div>
            ) : (
              <>
                {events.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-icon">📅</div>
                    <h2>Nothing tracked yet</h2>
                    <p>Enter a ticker symbol in the sidebar to start tracking earnings dates.</p>
                  </div>
                )}
                <div className="calendar-grid">
                  {calendarCells.map(({ dateStr, date, isOtherMonth, isToday, visible, overflow, dayEvents }) => (
                    <div key={dateStr} className={`cal-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'is-today' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}`}>
                      <div className="cell-date">
                        <span className={`date-num ${isToday ? 'today-num' : ''}`}>{date.getDate()}</span>
                      </div>
                      <div className="cell-events">
                        {visible.map(ev => (
                          <EventPill key={ev.id} ev={ev} onNews={openNews} onDelete={deleteEvent} deletingId={deletingId} />
                        ))}
                        {overflow > 0 && (
                          <button className="overflow-btn" onClick={() => setExpandedCell(dateStr)}>
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

        {view === 'agenda' && (
          <div className="agenda-wrap">
            {eventsLoading ? (
              <div className="cal-loading"><div className="mini-spinner large" /></div>
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
        const d     = new Date(expandedCell + 'T12:00:00');
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
                  <EventRow key={ev.id} ev={ev}
                    onNews={(t, e) => { setExpandedCell(null); openNews(t, e); }}
                    onDelete={deleteEvent} deletingId={deletingId}
                  />
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
                  <CompanyLogo domain={newsState.event.domain} symbol={newsState.ticker}
                    colorIndex={newsState.ticker.charCodeAt(0) % 6} />
                )}
                <span>{newsState.ticker} — News & Sentiment</span>
              </div>
              <button className="modal-close" onClick={() => setNewsState(null)}>×</button>
            </div>

            {/* Event strip */}
            {newsState.event && (
              <div className="news-event-strip">
                <span className="strip-date">
                  📅 {newsState.event.date ? new Date(newsState.event.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Date TBD'}
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

            {/* Position card — premium only */}
            {isPremium && (
              <PositionCard
                position={positions[newsState.ticker]}
                symbol={newsState.ticker}
                lastPrice={newsState.lastPrice}
                onEdit={savePosition}
                onDelete={deletePosition}
              />
            )}

            {/* Price chart — premium gated */}
            {isPremium
              ? <PriceChart ticker={newsState.ticker} />
              : <PremiumGate onUpgrade={() => { setNewsState(null); router.push('/subscribe'); }} />
            }

            {/* Related tickers — premium gated */}
            {isPremium ? (
              <RelatedTickers
                relationships={newsState.relationships}
                userVotes={newsState.userVotes}
                loading={newsState.relLoading}
                onAddTicker={ticker => addTicker(ticker)}
                onVote={handleVote}
                onSuggest={handleSuggest}
                trackedSymbols={trackedSymbols}
              />
            ) : null}

            {/* News list */}
            <div className="modal-body">
              {newsState.loading ? (
                <div className="modal-loading">
                  <div className="mini-spinner large" />
                  <p>Fetching latest news…</p>
                </div>
              ) : newsState.articles.length === 0 ? (
                <div className="modal-empty">No recent news found for {newsState.ticker}.</div>
              ) : (
                <>
                  <SentimentSummary articles={newsState.articles} />
                  {newsState.articles.map((item, i) => (
                  <div key={i} className="news-card">
                    <div className="news-card-meta">
                      <span className="news-source">{item.source}</span>
                      <span className="sentiment-pill" data-sentiment={item.sentiment}>
                        {item.sentiment === 'positive' ? '↑' : item.sentiment === 'negative' ? '↓' : '–'} {item.sentiment}
                      </span>
                      <span className="news-date">{item.publishedAt && !isNaN(new Date(item.publishedAt)) ? new Date(item.publishedAt).toLocaleDateString() : ''}</span>
                    </div>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="news-headline">
                      {item.headline}
                    </a>
                    {item.summary && item.summary !== item.headline && (
                      <p className="news-summary">{item.summary}</p>
                    )}
                  </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
