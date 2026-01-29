/**
 * Webhook: Call Ended Handler
 * POST /api/webhook/call-ended
 * 
 * Receives call-ended webhooks from ElevenLabs and sends
 * conditional SMS notifications via Twilio based on transcript analysis.
 */

// Twilio SDK
const twilio = require('twilio');

// ============================================================================
// SMS TEMPLATES (HARDCODED - Bank-safe, no AI generation)
// ============================================================================

const SMS_TEMPLATES = {
  REWARDS_SMS: "Mashreq Bank: This is a summary of your rewards discussed during today's call. Thank you for banking with us.",
  
  TRANSACTION_SMS: "Mashreq Bank: This is a confirmation regarding the transaction discussed during your recent call.",
  
  COMPLAINT_SMS: "Mashreq Bank: This message confirms the complaint status update shared during your call today.",
  
  OUTBOUND_CONFIRMATION_SMS: "Mashreq Bank: This message confirms the update shared during our outbound call today. Thank you.",
  
  REWARDS_TNC_SMS: `Mashreq Bank Rewards T&C Summary:
• Earn points on qualifying transactions (posted within 48hrs)
• Redeem for vouchers, cashback, or partner offers
• Points expire after 24 months
• Instant redemption available for select partners
• Points not earned on fees, cash withdrawals, or flagged transactions
• Account must be active for redemption
Full T&C: mashreqbank.com/rewards-tnc`,
};

// ============================================================================
// CLASSIFICATION KEYWORDS
// ============================================================================

// Keywords that TRIGGER SMS sending
const TRIGGER_KEYWORDS = {
  rewards_tnc: ['terms and conditions', 't&c', 'tnc', 'terms & conditions', 'send me the terms', 'send the terms', 'send terms'],
  rewards: ['reward', 'points', 'redeem', 'redemption', 'loyalty'],
  transaction: ['transaction', 'transfer', 'payment', 'fund', 'money', 'amount'],
  complaint: ['complaint', 'case', 'status', 'update', 'issue', 'problem', 'resolved'],
};

// Keywords that BLOCK SMS sending (failed verification, no resolution)
const BLOCK_KEYWORDS = [
  'unable to verify',
  'cannot proceed',
  'visit branch',
  'call again',
  'verification failed',
  'could not verify',
  'identity not confirmed',
  'please visit',
  'try again later',
];

// ============================================================================
// TRANSCRIPT CLASSIFICATION FUNCTION
// ============================================================================

/**
 * Analyzes transcript and determines if/what SMS should be sent
 * @param {string} transcript - Full call transcript
 * @param {string} callType - "INBOUND" or "OUTBOUND"
 * @returns {object} { shouldSend: boolean, smsType: string|null, reason: string }
 */
function classifyTranscript(transcript, callType) {
  const transcriptLower = transcript.toLowerCase();
  
  // Step 1: Check for BLOCK keywords - if found, do NOT send SMS
  for (const blockKeyword of BLOCK_KEYWORDS) {
    if (transcriptLower.includes(blockKeyword)) {
      return {
        shouldSend: false,
        smsType: null,
        reason: `Blocked: transcript contains "${blockKeyword}"`,
      };
    }
  }
  
  // Step 2: Check for T&C request FIRST (specific document request - highest priority)
  // This takes precedence even for outbound calls if customer requests it
  for (const keyword of TRIGGER_KEYWORDS.rewards_tnc) {
    if (transcriptLower.includes(keyword)) {
      return {
        shouldSend: true,
        smsType: 'REWARDS_TNC_SMS',
        reason: `Matched T&C request keyword: "${keyword}"`,
      };
    }
  }
  
  // Step 3: If OUTBOUND call (and no specific request), send outbound confirmation
  if (callType === 'OUTBOUND') {
    return {
      shouldSend: true,
      smsType: 'OUTBOUND_CONFIRMATION_SMS',
      reason: 'Outbound call completed',
    };
  }
  
  // Step 4: Check for other TRIGGER keywords (in priority order)
  
  // Check for complaint-related keywords (high priority for banking)
  for (const keyword of TRIGGER_KEYWORDS.complaint) {
    if (transcriptLower.includes(keyword)) {
      return {
        shouldSend: true,
        smsType: 'COMPLAINT_SMS',
        reason: `Matched complaint keyword: "${keyword}"`,
      };
    }
  }
  
  // Check for transaction-related keywords
  for (const keyword of TRIGGER_KEYWORDS.transaction) {
    if (transcriptLower.includes(keyword)) {
      return {
        shouldSend: true,
        smsType: 'TRANSACTION_SMS',
        reason: `Matched transaction keyword: "${keyword}"`,
      };
    }
  }
  
  // Check for rewards-related keywords
  for (const keyword of TRIGGER_KEYWORDS.rewards) {
    if (transcriptLower.includes(keyword)) {
      return {
        shouldSend: true,
        smsType: 'REWARDS_SMS',
        reason: `Matched rewards keyword: "${keyword}"`,
      };
    }
  }
  
  // Step 4: No match - do not send SMS
  return {
    shouldSend: false,
    smsType: null,
    reason: 'No trigger keywords matched',
  };
}

// ============================================================================
// TWILIO SMS SENDER FUNCTION
// ============================================================================

/**
 * Sends SMS via Twilio
 * @param {string} toNumber - Customer phone number
 * @param {string} smsType - Type of SMS template to use
 * @returns {Promise<object>} { success: boolean, messageId?: string, error?: string }
 */
async function sendSMS(toNumber, smsType) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  
  // Validate Twilio credentials
  if (!accountSid || !authToken || !fromNumber) {
    console.error('Missing Twilio credentials');
    return {
      success: false,
      error: 'Missing Twilio credentials',
    };
  }
  
  // Get SMS template
  const messageBody = SMS_TEMPLATES[smsType];
  if (!messageBody) {
    console.error(`Unknown SMS type: ${smsType}`);
    return {
      success: false,
      error: `Unknown SMS type: ${smsType}`,
    };
  }
  
  try {
    const client = twilio(accountSid, authToken);
    
    const message = await client.messages.create({
      body: messageBody,
      from: fromNumber,
      to: toNumber,
    });
    
    console.log(`SMS sent successfully. SID: ${message.sid}`);
    return {
      success: true,
      messageId: message.sid,
    };
  } catch (error) {
    console.error('Twilio SMS error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Always return 200 to ElevenLabs (as per requirement)
  // Process asynchronously and log results
  
  try {
    const { call_type, phone_number, transcript, timestamp } = req.body;
    
    console.log('='.repeat(60));
    console.log('WEBHOOK RECEIVED: Call Ended');
    console.log(`Timestamp: ${timestamp}`);
    console.log(`Call Type: ${call_type}`);
    console.log(`Phone: ${phone_number}`);
    console.log(`Transcript Length: ${transcript?.length || 0} chars`);
    console.log('='.repeat(60));
    
    // Validate required fields
    if (!phone_number || !transcript) {
      console.log('Missing required fields (phone_number or transcript)');
      return res.status(200).json({
        received: true,
        sms_sent: false,
        reason: 'Missing required fields',
      });
    }
    
    // Classify the transcript
    const classification = classifyTranscript(transcript, call_type || 'INBOUND');
    
    console.log('Classification Result:', classification);
    
    // Decide whether to send SMS
    if (!classification.shouldSend) {
      console.log(`SMS NOT sent: ${classification.reason}`);
      return res.status(200).json({
        received: true,
        sms_sent: false,
        reason: classification.reason,
      });
    }
    
    // Send SMS
    console.log(`Sending ${classification.smsType} to ${phone_number}...`);
    const smsResult = await sendSMS(phone_number, classification.smsType);
    
    if (smsResult.success) {
      console.log(`SMS sent successfully: ${smsResult.messageId}`);
      return res.status(200).json({
        received: true,
        sms_sent: true,
        sms_type: classification.smsType,
        message_id: smsResult.messageId,
        reason: classification.reason,
      });
    } else {
      console.error(`SMS failed: ${smsResult.error}`);
      return res.status(200).json({
        received: true,
        sms_sent: false,
        sms_error: smsResult.error,
        reason: classification.reason,
      });
    }
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Always return 200 to ElevenLabs
    return res.status(200).json({
      received: true,
      sms_sent: false,
      error: error.message,
    });
  }
};
