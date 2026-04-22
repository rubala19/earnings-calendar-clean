import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function Landing() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/app');
  }, [status, router]);

  if (status === 'loading') return null;

  return (
    <div className="landing">

      {/* ── Nav ── */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-logo">
            <span className="landing-logo-mark">WF</span>
            <span className="landing-logo-name">Wofinn</span>
          </div>
          <div className="landing-nav-links">
            <a href="#features" className="landing-nav-link">Features</a>
            <a href="#pricing"  className="landing-nav-link">Pricing</a>
            <Link href="/auth/signin" className="landing-nav-signin">Sign in</Link>
            <Link href="/auth/signin" className="landing-nav-cta">Get started free</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-badge">
            <span className="hero-badge-dot" />
            AI-powered financial intelligence
          </div>
          <h1 className="landing-hero-headline">
            Your personal<br />
            <span className="landing-hero-gradient">financial analyst</span><br />
            never sleeps
          </h1>
          <p className="landing-hero-sub">
            Wofinn tracks earnings dates, analyses news sentiment, maps supply chain
            relationships, and monitors your positions — all in one intelligent agent
            built for serious investors.
          </p>
          <div className="landing-hero-actions">
            <Link href="/auth/signin" className="landing-hero-cta-primary">Start for free</Link>
            <a href="#features" className="landing-hero-cta-secondary">See how it works →</a>
          </div>
          <p className="landing-hero-fine">No credit card required · Free plan available · Premium from $0.99/mo</p>
        </div>

        {/* Hero visual — mock modal */}
        <div className="landing-hero-visual">
          <div className="hero-card">
            <div className="hero-card-header">
              <div className="hero-card-dot red" />
              <div className="hero-card-dot yellow" />
              <div className="hero-card-dot green" />
              <span className="hero-card-title">Wofinn — NVDA</span>
            </div>
            <div className="hero-card-body">
              <div className="hero-strip">
                <span className="hero-strip-date">📅 May 28, 2025</span>
                <span className="hero-strip-badge">Pre-mkt</span>
                <span className="hero-strip-eps">EPS est. $5.89</span>
              </div>
              <div className="hero-chart-mock">
                <svg viewBox="0 0 300 80" width="100%" height="80">
                  <defs>
                    <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.3"/>
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  <path d="M0,60 L30,55 L60,58 L90,45 L120,48 L150,35 L180,30 L210,25 L240,20 L270,15 L300,10 L300,80 L0,80 Z" fill="url(#hg)"/>
                  <path d="M0,60 L30,55 L60,58 L90,45 L120,48 L150,35 L180,30 L210,25 L240,20 L270,15 L300,10" fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round"/>
                  <circle cx="300" cy="10" r="4" fill="#10b981"/>
                </svg>
              </div>
              <div className="hero-price-row">
                <span className="hero-price">$487.21</span>
                <span className="hero-change">+18.40 (+3.92%)</span>
              </div>
              <div className="hero-sent-row">
                <span className="hero-sent-label">Sentiment</span>
                <div className="hero-sent-bar">
                  <div style={{ width: '68%', height: '100%', background: '#10b981', borderRadius: '2px 0 0 2px' }}/>
                  <div style={{ width: '20%', height: '100%', background: '#94a3b8' }}/>
                  <div style={{ width: '12%', height: '100%', background: '#ef4444', borderRadius: '0 2px 2px 0' }}/>
                </div>
                <span style={{ color: '#10b981', fontSize: '11px', fontWeight: 600 }}>Bullish</span>
              </div>
              <div className="hero-rel-row">
                <span className="hero-rel-label">Related</span>
                {['ASML','TSM','DELL','AMD'].map(t => (
                  <span key={t} className="hero-rel-chip">{t}</span>
                ))}
              </div>
              <div className="hero-pos-row">
                <span className="hero-pos-label">Position</span>
                <span className="hero-pos-val">100 sh @ $387.20</span>
                <span className="hero-pos-pnl" style={{ color: '#10b981' }}>+$10,001 (+25.8%)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="landing-features" id="features">
        <div className="landing-section-inner">
          <div className="landing-section-badge">What Wofinn does</div>
          <h2 className="landing-section-title">Everything your broker<br/>doesn't tell you</h2>
          <p className="landing-section-sub">Wofinn connects earnings dates, news sentiment, supply chain relationships and your portfolio into a single intelligence layer.</p>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">📅</div>
              <h3>Earnings Calendar</h3>
              <p>Track upcoming earnings dates for any US-listed ticker. BMO/AMC timing, EPS estimates, and auto-discovery across multiple data sources.</p>
              <span className="feature-tag free">Free</span>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📰</div>
              <h3>News Sentiment</h3>
              <p>Aggregates news from multiple sources and scores sentiment with a visual gauge — bullish, bearish, or neutral at a glance before earnings.</p>
              <span className="feature-tag free">Free</span>
            </div>
            <div className="feature-card feature-card-premium">
              <div className="feature-icon">🕸️</div>
              <h3>Relationship Graph</h3>
              <p>AI-powered supply chain mapping. See upstream suppliers, downstream customers, direct peers, and adjacent partners — crowdsourced for accuracy.</p>
              <span className="feature-tag premium">Premium</span>
            </div>
            <div className="feature-card feature-card-premium">
              <div className="feature-icon">📈</div>
              <h3>Price Charts</h3>
              <p>5-day and 1-month price charts with live P&L, change percentage, and visual indicators — right inside the earnings modal.</p>
              <span className="feature-tag premium">Premium</span>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💼</div>
              <h3>Position Tracking</h3>
              <p>Track your average cost basis and share count for each ticker. Premium users see unrealized P&L calculated against the live price.</p>
              <span className="feature-tag free">Free</span>
            </div>
            <div className="feature-card feature-card-coming">
              <div className="feature-icon">🤖</div>
              <h3>AI Financial Agent</h3>
              <p>Wofinn is evolving into a full personal financial analyst — proactive insights, portfolio risk alerts, and earnings impact analysis.</p>
              <span className="feature-tag coming">Coming soon</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="landing-how">
        <div className="landing-section-inner">
          <div className="landing-section-badge">How it works</div>
          <h2 className="landing-section-title">From ticker to intelligence<br/>in seconds</h2>
          <div className="how-steps">
            <div className="how-step">
              <div className="how-step-num">01</div>
              <h3>Add a ticker</h3>
              <p>Type any US-listed symbol. Wofinn fetches the next earnings date, time of day, and EPS estimate automatically.</p>
            </div>
            <div className="how-step-arrow">→</div>
            <div className="how-step">
              <div className="how-step-num">02</div>
              <h3>See the full picture</h3>
              <p>Click any earnings event to open the intelligence modal — news sentiment, price chart, related tickers, and your position P&L.</p>
            </div>
            <div className="how-step-arrow">→</div>
            <div className="how-step">
              <div className="how-step-num">03</div>
              <h3>Make better decisions</h3>
              <p>Know the sentiment, the supply chain, and your exposure — before the earnings call, not after.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="landing-pricing" id="pricing">
        <div className="landing-section-inner">
          <div className="landing-section-badge">Pricing</div>
          <h2 className="landing-section-title">Start free.<br/>Upgrade when you're ready.</h2>
          <div className="pricing-grid">
            <div className="pricing-card">
              <div className="pricing-card-header">
                <h3 className="pricing-plan">Free</h3>
                <div className="pricing-price">
                  <span className="pricing-amount">$0</span>
                  <span className="pricing-period">forever</span>
                </div>
                <p className="pricing-desc">Everything you need to track earnings dates and stay informed.</p>
              </div>
              <ul className="pricing-features">
                <li className="pricing-feature"><span className="pf-check">✓</span>Earnings calendar — unlimited tickers</li>
                <li className="pricing-feature"><span className="pf-check">✓</span>BMO / AMC timing + EPS estimates</li>
                <li className="pricing-feature"><span className="pf-check">✓</span>News aggregation + sentiment analysis</li>
                <li className="pricing-feature"><span className="pf-check">✓</span>Position tracking (cost basis + quantity)</li>
                <li className="pricing-feature"><span className="pf-check">✓</span>Agenda and calendar views</li>
              </ul>
              <Link href="/auth/signin" className="pricing-cta pricing-cta-free">Get started free</Link>
            </div>

            <div className="pricing-card pricing-card-featured">
              <div className="pricing-featured-badge">Most popular</div>
              <div className="pricing-card-header">
                <h3 className="pricing-plan">Premium</h3>
                <div className="pricing-price">
                  <span className="pricing-amount">$0.99</span>
                  <span className="pricing-period">/ month</span>
                </div>
                <p className="pricing-desc">The full intelligence layer for serious investors.</p>
              </div>
              <ul className="pricing-features">
                <li className="pricing-feature"><span className="pf-check">✓</span>Everything in Free</li>
                <li className="pricing-feature"><span className="pf-check star">⭐</span>Price charts (5D + 1M) in earnings modal</li>
                <li className="pricing-feature"><span className="pf-check star">⭐</span>AI relationship graph — upstream, downstream, peers</li>
                <li className="pricing-feature"><span className="pf-check star">⭐</span>Vote to improve relationship accuracy</li>
                <li className="pricing-feature"><span className="pf-check star">⭐</span>Add related tickers in one click</li>
                <li className="pricing-feature"><span className="pf-check star">⭐</span>Live P&L on your positions</li>
                <li className="pricing-feature"><span className="pf-check star">⭐</span>Early access to AI agent features</li>
              </ul>
              <Link href="/subscribe" className="pricing-cta pricing-cta-premium">Start Premium — $0.99/mo</Link>
              <p className="pricing-fine">Cancel anytime. No contracts.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust signals ── */}
      <section className="landing-trust">
        <div className="landing-section-inner">
          <div className="trust-grid">
            <div className="trust-item">
              <span className="trust-icon">🔒</span>
              <div><strong>Secure by default</strong><span>OAuth sign-in, row-level security, no passwords stored</span></div>
            </div>
            <div className="trust-item">
              <span className="trust-icon">📡</span>
              <div><strong>Multiple data sources</strong><span>FMP, Yahoo Finance, Nasdaq Data Link — round-robin for reliability</span></div>
            </div>
            <div className="trust-item">
              <span className="trust-icon">🧠</span>
              <div><strong>AI-powered relationships</strong><span>Claude LLM maps supply chains, crowdsourced accuracy improves over time</span></div>
            </div>
            <div className="trust-item">
              <span className="trust-icon">💳</span>
              <div><strong>Stripe payments</strong><span>Industry-standard billing, cancel anytime from your account</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="landing-final-cta">
        <div className="landing-section-inner landing-final-inner">
          <h2 className="landing-final-title">Ready to invest smarter?</h2>
          <p className="landing-final-sub">Join investors who use Wofinn to stay ahead of earnings season.</p>
          <Link href="/auth/signin" className="landing-hero-cta-primary large">Get started free →</Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <span className="landing-logo-mark small">WF</span>
            <span className="landing-logo-name">Wofinn</span>
            <span className="landing-footer-copy">© {new Date().getFullYear()} Wofinn. All rights reserved.</span>
          </div>
          <div className="landing-footer-links">
            <Link href="/auth/signin" className="landing-footer-link">Sign in</Link>
            <Link href="/subscribe"   className="landing-footer-link">Pricing</Link>
            <a href="mailto:hello@wofinn.io" className="landing-footer-link">Contact</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
