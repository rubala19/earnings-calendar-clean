import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function Subscribe() {
  const { data: session, status } = useSession();
  const router   = useRouter();
  const canceled = router.query.canceled === '1';
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  async function handleSubscribe() {
    if (!session) { router.push('/auth/signin'); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/stripe/checkout', { method: 'POST' });
      const data = await res.json();
      if (data.code === 'ALREADY_SUBSCRIBED') {
        router.push('/app');
        return;
      }
      if (!res.ok) { setError(data.error || 'Something went wrong'); return; }
      window.location.href = data.url;
    } catch {
      setError('Failed to start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="subscribe-page">
      <div className="subscribe-card">

        <div className="subscribe-brand">
          <span className="brand-mark">WF</span>
          <span className="brand-name">Wofinn</span>
        </div>

        {canceled && (
          <div className="subscribe-notice canceled">
            Checkout canceled — no charge was made.
          </div>
        )}

        <div className="subscribe-hero">
          <div className="subscribe-price">
            <span className="price-amount">$0.99</span>
            <span className="price-period">/ month</span>
          </div>
          <h1 className="subscribe-title">Premium</h1>
          <p className="subscribe-sub">Everything you need to track earnings like a pro.</p>
        </div>

        <ul className="feature-list">
          <li className="feature-item included">
            <span className="feature-check">✓</span>
            <div>
              <strong>Price charts</strong>
              <span>5D and 1M charts right in the earnings modal</span>
            </div>
          </li>
          <li className="feature-item included">
            <span className="feature-check">✓</span>
            <div>
              <strong>Related tickers graph</strong>
              <span>Upstream, downstream, peers and adjacent companies</span>
            </div>
          </li>
          <li className="feature-item included">
            <span className="feature-check">✓</span>
            <div>
              <strong>Crowdsourced accuracy</strong>
              <span>Vote on relationships — help build a better data set</span>
            </div>
          </li>
          <li className="feature-item included">
            <span className="feature-check">✓</span>
            <div>
              <strong>Add related tickers in one click</strong>
              <span>Track a whole supply chain from a single earnings event</span>
            </div>
          </li>
          <li className="feature-item always">
            <span className="feature-check free">✓</span>
            <div>
              <strong>Everything in Free</strong>
              <span>Calendar, earnings dates, news & sentiment — always free</span>
            </div>
          </li>
        </ul>

        {error && <div className="subscribe-error">{error}</div>}

        <button
          className="subscribe-btn"
          onClick={handleSubscribe}
          disabled={loading || status === 'loading'}
        >
          {loading ? 'Redirecting to checkout…' : 'Subscribe for $0.99 / month'}
        </button>

        <p className="subscribe-fine">
          Cancel anytime. No contracts. Billed monthly via Stripe.
        </p>

        <button className="subscribe-back" onClick={() => router.push('/app')}>
          ← Back to calendar
        </button>
      </div>
    </div>
  );
}
