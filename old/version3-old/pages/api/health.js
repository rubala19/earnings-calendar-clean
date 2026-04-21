// FIX #16: Removed env key presence exposure — this endpoint is public and
// unauthenticated, so revealing which API keys are configured is a
// reconnaissance risk. Only return operational status now.
export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
