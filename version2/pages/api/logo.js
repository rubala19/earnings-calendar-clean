// FIX #8: Logo proxy — keeps the logo.dev API token on the server side.
// The client requests /api/logo?domain=apple.com and this route forwards
// the request to logo.dev with the token injected server-side, so the
// token is never exposed in the browser's network requests or JS bundle.
//
// Set LOGO_DEV_TOKEN in your environment variables.

export default async function handler(req, res) {
  const { domain } = req.query;

  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: 'Missing domain parameter' });
  }

  // Sanitize: only allow valid domain-like strings
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    return res.status(400).json({ error: 'Invalid domain' });
  }

  const token = process.env.LOGO_DEV_TOKEN;
  if (!token) {
    return res.status(404).end();
  }

  try {
    const upstream = await fetch(
      `https://img.logo.dev/${domain}?token=${token}`,
      { headers: { 'User-Agent': 'earnings-calendar/1.0' } }
    );

    if (!upstream.ok) {
      return res.status(upstream.status).end();
    }

    const contentType = upstream.headers.get('content-type') || 'image/png';
    const buffer = await upstream.arrayBuffer();

    // Cache logo images for 24 hours
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error('[logo] Proxy error:', err.message);
    return res.status(502).end();
  }
}
