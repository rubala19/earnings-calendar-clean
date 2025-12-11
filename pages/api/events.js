import axios from 'axios';

const DEBUG = (process.env.DEBUG_LOGS === 'true');
function dbg(...args) { if (DEBUG) console.log(...args); }

const BIN_ID = process.env.JSONBIN_BIN_ID;
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
const BASE_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

async function loadEvents() {
  dbg('[events] Loading from JSONBin...');
  const resp = await axios.get(`${BASE_URL}/latest`, { 
    headers: { 'X-Master-Key': MASTER_KEY } 
  });
  const j = resp.data;
  
  let events = [];
  if (Array.isArray(j.record)) {
    events = j.record;
  } else if (j.record && Array.isArray(j.record.data)) {
    events = j.record.data;
  }
  
  dbg('[events] Loaded events:', events.length);
  return Array.isArray(events) ? events : [];
}

async function saveEvents(events) {
  dbg('[events] Saving to JSONBin...');
  await axios.put(BASE_URL, events, { 
    headers: { 
      'X-Master-Key': MASTER_KEY, 
      'Content-Type': 'application/json' 
    } 
  });
  dbg('[events] Saved successfully');
}

export default async function handler(req, res) {
  if (!BIN_ID || !MASTER_KEY) {
    console.error('[events] Missing JSONBin credentials');
    return res.status(500).json({ error: 'Missing credentials' });
  }

  try {
    dbg('[events] Method:', req.method);

    if (req.method === 'GET') {
      const events = await loadEvents();
      return res.status(200).json(events);
    }

    if (req.method === 'POST') {
      const { symbol, name, date, time, domain } = req.body;
      
      if (!symbol || !date) {
        return res.status(400).json({ error: 'Symbol and date required' });
      }

      const events = await loadEvents();
      
      // Check for duplicates
      const exists = events.some(e => 
        e.symbol === symbol && e.date === date
      );
      
      if (exists) {
        dbg('[events] Duplicate event, skipping');
        return res.status(200).json(events);
      }

      // Add new event
      events.push({
        symbol: symbol.toUpperCase(),
        name: name || symbol,
        date,
        time: time || 'TBD',
        domain: domain || `${symbol.toLowerCase()}.com`
      });

      // Sort by date
      events.sort((a, b) => new Date(a.date) - new Date(b.date));

      await saveEvents(events);
      dbg('[events] Event added, total:', events.length);
      
      return res.status(200).json(events);
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end('Method Not Allowed');

  } catch (err) {
    console.error('[events] Error:', err.response?.data || err.message);
    console.error(err.stack);
    return res.status(500).json({ 
      error: 'Server error', 
      details: err.message 
    });
  }
}
