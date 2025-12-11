export default function handler(req, res) {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasAlphaVantageKey: !!process.env.ALPHAVANTAGE_KEY,
      hasJsonBinId: !!process.env.JSONBIN_BIN_ID,
      hasJsonBinKey: !!process.env.JSONBIN_MASTER_KEY,
      debugEnabled: process.env.DEBUG_LOGS === 'true'
    }
  });
}
