// pages/api/relationships/admin.js
//
// GET  /api/relationships/admin         — fetch admin queue
// POST /api/relationships/admin         — approve/reject/edit an edge
//
// Admin-only endpoint. Checks session email against ADMIN_EMAILS env var.

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getAdminQueue, adminUpdateEdge } from '../../../lib/graph';

function isAdmin(session) {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(session?.user?.email?.toLowerCase());
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (!isAdmin(session)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // ── GET: fetch queue ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const queue = await getAdminQueue();
    return res.status(200).json(queue);
  }

  // ── POST: update edge ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { edgeId, action, updates, note } = req.body;

    if (!edgeId || !action) {
      return res.status(400).json({ error: 'edgeId and action are required' });
    }

    const validActions = new Set(['approve', 'reject', 'edit', 'reclassify']);
    if (!validActions.has(action)) {
      return res.status(400).json({ error: `Invalid action. Use: ${[...validActions].join(', ')}` });
    }

    // Map action to status update
    const statusMap = { approve: 'active', reject: 'rejected' };
    const dbUpdates = {
      ...(statusMap[action] ? { status: statusMap[action] } : {}),
      ...(updates ?? {}),
    };

    // Approvals boost confidence
    if (action === 'approve') {
      dbUpdates.confidence = 0.95;
      dbUpdates.source     = 'admin';
    }

    try {
      await adminUpdateEdge({
        edgeId:  Number(edgeId),
        adminId: session.user.id,
        action,
        updates: dbUpdates,
        note:    note ?? null,
      });

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[relationships/admin] Error:', err.message);
      return res.status(500).json({ error: 'Failed to update edge' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end();
}
