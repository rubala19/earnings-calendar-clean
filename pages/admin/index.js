import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';

const ACTION_LABELS = {
  approve:     { label: 'Approve',     cls: 'btn-approve' },
  reject:      { label: 'Reject',      cls: 'btn-reject'  },
  reclassify:  { label: 'Reclassify',  cls: 'btn-neutral' },
};

const REL_TYPES = ['upstream', 'downstream', 'peer', 'adjacent'];

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [queue, setQueue]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState(null);  // edge id being actioned
  const [note, setNote]       = useState('');
  const [toast, setToast]     = useState(null);
  const [reclassifyTarget, setReclassifyTarget] = useState(null); // { edgeId, newType }

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return; }
    if (status === 'authenticated') loadQueue();
  }, [status]);

  async function loadQueue() {
    setLoading(true);
    try {
      const res = await fetch('/api/relationships/admin');
      if (res.status === 403) { router.push('/'); return; }
      const data = await res.json();
      setQueue(Array.isArray(data) ? data : []);
    } catch {
      showToast('Failed to load queue', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function act(edgeId, action, extra = {}) {
    setActing(edgeId);
    try {
      const res = await fetch('/api/relationships/admin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ edgeId, action, note, ...extra }),
      });
      if (!res.ok) {
        const d = await res.json();
        showToast(d.error || 'Action failed', 'error');
        return;
      }
      showToast(`Edge ${action}d`, 'success');
      setNote('');
      setReclassifyTarget(null);
      await loadQueue();
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setActing(null);
    }
  }

  function showToast(message, type) {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  if (status === 'loading' || loading) {
    return (
      <div className="admin-loading">
        <div className="mini-spinner large" />
        <p>Loading admin queue…</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div className="admin-brand">
          <span className="brand-mark">EC</span>
          <h1>Relationship Graph — Admin</h1>
        </div>
        <div className="admin-header-right">
          <span className="admin-count">{queue.length} items in queue</span>
          <button className="btn-neutral" onClick={loadQueue}>↻ Refresh</button>
          <button className="btn-neutral" onClick={() => router.push('/')}>← Calendar</button>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="admin-empty">
          <div className="empty-icon">✓</div>
          <h2>Queue is clear</h2>
          <p>No pending edges or low-confidence relationships to review.</p>
        </div>
      ) : (
        <div className="admin-queue">
          {queue.map(edge => (
            <div
              key={edge.id}
              className={`admin-edge-card ${edge.status === 'pending' ? 'pending' : 'flagged'}`}
            >
              <div className="edge-card-header">
                <div className="edge-card-symbols">
                  <span className="edge-symbol from">{edge.from_symbol}</span>
                  <span className="edge-arrow">→</span>
                  <span className={`edge-rel-type rel-${edge.rel_type}`}>{edge.rel_type}</span>
                  <span className="edge-arrow">→</span>
                  <span className="edge-symbol to">{edge.to_symbol}</span>
                  {edge.to_name && <span className="edge-to-name">({edge.to_name})</span>}
                </div>
                <div className="edge-card-meta">
                  <span className={`edge-status status-${edge.status}`}>{edge.status}</span>
                  <span className="edge-source">{edge.source}</span>
                  <span className="edge-confidence">
                    conf: {(edge.confidence * 100).toFixed(0)}%
                  </span>
                  <span className="edge-votes">
                    👍 {edge.vote_up} 👎 {edge.vote_down}
                  </span>
                </div>
              </div>

              {edge.reason && (
                <p className="edge-reason">"{edge.reason}"</p>
              )}

              {/* Reclassify dropdown */}
              {reclassifyTarget?.edgeId === edge.id && (
                <div className="reclassify-row">
                  <select
                    value={reclassifyTarget.newType}
                    onChange={e => setReclassifyTarget({ edgeId: edge.id, newType: e.target.value })}
                    className="reclassify-select"
                  >
                    {REL_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button
                    className="btn-approve"
                    onClick={() => act(edge.id, 'reclassify', { updates: { rel_type: reclassifyTarget.newType } })}
                    disabled={acting === edge.id}
                  >
                    Confirm
                  </button>
                  <button className="btn-neutral" onClick={() => setReclassifyTarget(null)}>
                    Cancel
                  </button>
                </div>
              )}

              <div className="edge-card-actions">
                <input
                  type="text"
                  className="edge-note-input"
                  placeholder="Optional note…"
                  value={acting === edge.id ? note : ''}
                  onChange={e => setNote(e.target.value)}
                />
                <button
                  className="btn-approve"
                  onClick={() => act(edge.id, 'approve')}
                  disabled={acting === edge.id}
                >
                  ✓ Approve
                </button>
                <button
                  className="btn-reject"
                  onClick={() => act(edge.id, 'reject')}
                  disabled={acting === edge.id}
                >
                  ✗ Reject
                </button>
                <button
                  className="btn-neutral"
                  onClick={() => setReclassifyTarget({ edgeId: edge.id, newType: edge.rel_type })}
                  disabled={acting === edge.id}
                >
                  ⇄ Reclassify
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}
