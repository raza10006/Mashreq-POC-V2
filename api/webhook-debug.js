/**
 * Webhook Debug Endpoint
 * POST /api/webhook-debug - Logs any incoming payload
 * GET /api/webhook-debug - Shows last received payload
 * 
 * Use this to see exactly what ElevenLabs is sending
 */

// In-memory storage for last payload (for debugging only)
let lastPayload = null;
let lastReceivedAt = null;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'POST') {
    // Store the payload
    lastPayload = req.body;
    lastReceivedAt = new Date().toISOString();
    
    console.log('='.repeat(60));
    console.log('DEBUG WEBHOOK RECEIVED');
    console.log('Timestamp:', lastReceivedAt);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('='.repeat(60));
    
    return res.status(200).json({
      received: true,
      timestamp: lastReceivedAt,
      message: 'Payload logged successfully',
    });
  }
  
  if (req.method === 'GET') {
    if (!lastPayload) {
      return res.status(200).json({
        message: 'No webhook payload received yet',
        hint: 'Configure ElevenLabs to send webhooks to /api/webhook-debug temporarily',
      });
    }
    
    return res.status(200).json({
      lastReceivedAt,
      payload: lastPayload,
    });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};
