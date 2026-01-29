/**
 * Test SMS Endpoint
 * GET /api/test-sms?phone=+1234567890
 * 
 * Use this to verify Twilio is configured correctly
 */

const twilio = require('twilio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Check for phone parameter
  const phone = req.query.phone;
  
  if (!phone) {
    return res.status(400).json({
      error: 'Missing phone parameter',
      usage: '/api/test-sms?phone=+1234567890',
    });
  }
  
  // Check Twilio credentials
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  
  const credentialStatus = {
    TWILIO_ACCOUNT_SID: accountSid ? `Set (${accountSid.substring(0, 6)}...)` : 'NOT SET',
    TWILIO_AUTH_TOKEN: authToken ? 'Set (hidden)' : 'NOT SET',
    TWILIO_FROM_NUMBER: fromNumber || 'NOT SET',
  };
  
  if (!accountSid || !authToken || !fromNumber) {
    return res.status(500).json({
      error: 'Missing Twilio credentials',
      credentials: credentialStatus,
    });
  }
  
  try {
    const client = twilio(accountSid, authToken);
    
    const message = await client.messages.create({
      body: 'Mashreq Bank: Test SMS from your outbound call system. If you received this, SMS is working correctly!',
      from: fromNumber,
      to: phone,
    });
    
    return res.status(200).json({
      success: true,
      message: 'Test SMS sent successfully',
      messageId: message.sid,
      to: phone,
      from: fromNumber,
      credentials: credentialStatus,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      credentials: credentialStatus,
    });
  }
};
