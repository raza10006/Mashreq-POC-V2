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
  // Rewards confirmation
  REWARDS_SMS: "Mashreq Bank: This confirms your rewards inquiry. Your current balance and transaction details were shared during the call. For questions, call us anytime. Thank you for banking with us.",
  
  // Transaction/Transfer confirmation with reference
  TRANSACTION_SMS: `Mashreq Bank: Transaction Confirmation
Your funds transfer inquiry has been addressed. 
Status and reference details were shared during your call.
If the beneficiary has not received funds within the stated timeline, please contact us.
Thank you for banking with Mashreq.`,
  
  // Complaint status confirmation
  COMPLAINT_SMS: "Mashreq Bank: This confirms the complaint status update shared during your call. Your case is being handled as per our service commitment. For further assistance, please call us. Thank you.",
  
  // Outbound call confirmation
  OUTBOUND_CONFIRMATION_SMS: "Mashreq Bank: This confirms the update shared during our call today. If you have any questions, please contact us. Thank you for being a valued customer.",
  
  // Rewards T&C
  REWARDS_TNC_SMS: `Mashreq Bank Rewards T&C Summary:
• Earn points on qualifying transactions (posted within 48hrs)
• Redeem for vouchers, cashback, or partner offers (min 500 points)
• Points expire after 24 months from earning
• Instant redemption via App/Web for select partners
• No points on fees, cash withdrawals, or flagged transactions
• Account must be active & KYC compliant
Full T&C: mashreqbank.com/rewards-tnc`,

  // SWIFT/Transaction Reference
  TRANSACTION_REFERENCE_SMS: `Mashreq Bank: Transaction Reference
Your transaction details and SWIFT reference were shared during your call.
Please retain this SMS for your records.
For status updates or assistance, contact Mashreq Bank.
Thank you.`,

  // Redemption confirmation
  REDEMPTION_SMS: `Mashreq Bank Rewards: Redemption Confirmation
Your redemption request details were shared during the call.
Redemption Rules:
• Min 500 points required
• Increments of 100 points
• Instant redemption is final
Thank you for using Mashreq Rewards.`,

  // General call summary
  CALL_SUMMARY_SMS: "Mashreq Bank: Thank you for your call. A summary of your inquiry has been noted. For any further assistance, please contact us. We value your banking relationship.",
};

// ============================================================================
// CLASSIFICATION KEYWORDS
// ============================================================================

// Keywords that TRIGGER SMS sending (in priority order)
// IMPORTANT: These must detect REQUESTS to send SMS, not just mentions of topics
const TRIGGER_KEYWORDS = {
  // T&C requests - customer asks to send terms and conditions
  rewards_tnc: [
    'send terms and conditions',
    'send the terms',
    'send me the terms',
    'send t&c',
    'send tnc',
    'send t and c',
    'terms and conditions by sms',
    'terms and conditions via sms',
    'terms by sms',
    'terms via sms',
    't&c by sms',
    't&c via sms',
    'tnc by sms',
    'tnc via sms',
  ],
  
  // Transaction reference/SWIFT requests - customer asks for transaction details
  transaction_reference: [
    'send swift',
    'send the swift',
    'send reference number',
    'send the reference',
    'send transaction',
    'swift by sms',
    'swift via sms',
    'reference by sms',
    'reference via sms',
    'transaction details by sms',
    'transaction details via sms',
  ],
  
  // Redemption rules request - customer asks to send redemption info
  redemption: [
    'send redemption',
    'send me redemption',
    'send the redemption',
    'send me the redemption',
    'redemption rules',
    'redemption by sms',
    'redemption via sms',
    'redeem by sms',
    'redeem via sms',
    'rewards redemption',
    'how to redeem',
  ],
  
  // Complaint/Case confirmation - when agent promises to send complaint confirmation
  complaint: [
    'case reference',
    'complaint reference',
    'initiated a complaint',
    'raise a complaint',
    'raised a complaint',
    'complaint to investigate',
    'log a complaint',
    'logged a complaint',
    'complaint confirmation',
    'complaint status',
  ],
  
  // General summary/confirmation request
  summary: [
    'send summary via sms',
    'send me a summary',
    'send confirmation via sms',
    'send me confirmation',
    'send details via sms',
  ],
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
  
  // DEBUG: Log a snippet of the transcript for debugging
  console.log('Classifying transcript (first 500 chars):', transcriptLower.substring(0, 500));
  console.log('Call type:', callType);
  
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
  
  // Step 2: Check for specific SMS requests (highest priority)
  // These take precedence even for outbound calls if customer requests them
  
  // Check for T&C request
  for (const keyword of TRIGGER_KEYWORDS.rewards_tnc) {
    if (transcriptLower.includes(keyword)) {
      return {
        shouldSend: true,
        smsType: 'REWARDS_TNC_SMS',
        reason: `Matched T&C request keyword: "${keyword}"`,
      };
    }
  }
  
  // Check for transaction reference/SWIFT request
  for (const keyword of TRIGGER_KEYWORDS.transaction_reference) {
    if (transcriptLower.includes(keyword)) {
      return {
        shouldSend: true,
        smsType: 'TRANSACTION_REFERENCE_SMS',
        reason: `Matched transaction reference keyword: "${keyword}"`,
      };
    }
  }
  
  // Check for redemption request
  for (const keyword of TRIGGER_KEYWORDS.redemption) {
    if (transcriptLower.includes(keyword)) {
      return {
        shouldSend: true,
        smsType: 'REDEMPTION_SMS',
        reason: `Matched redemption keyword: "${keyword}"`,
      };
    }
  }
  
  // Check for complaint/case reference - agent promised to send complaint confirmation
  for (const keyword of TRIGGER_KEYWORDS.complaint) {
    if (transcriptLower.includes(keyword)) {
      return {
        shouldSend: true,
        smsType: 'COMPLAINT_SMS',
        reason: `Matched complaint keyword: "${keyword}"`,
      };
    }
  }
  
  // Check for summary/confirmation request
  for (const keyword of TRIGGER_KEYWORDS.summary) {
    if (transcriptLower.includes(keyword)) {
      return {
        shouldSend: true,
        smsType: 'CALL_SUMMARY_SMS',
        reason: `Matched summary request keyword: "${keyword}"`,
      };
    }
  }
  
  // Step 3: If OUTBOUND call (and no specific request above), send outbound confirmation
  if (callType === 'OUTBOUND') {
    return {
      shouldSend: true,
      smsType: 'OUTBOUND_CONFIRMATION_SMS',
      reason: 'Outbound call completed',
    };
  }
  
  // Step 4: No specific SMS request detected - do NOT send SMS
  // We only send SMS when there's an explicit request or the agent promised to send something
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
    // Log the ENTIRE payload to see what ElevenLabs sends
    console.log('='.repeat(60));
    console.log('WEBHOOK RECEIVED: Call Ended');
    console.log('RAW PAYLOAD:', JSON.stringify(req.body, null, 2));
    console.log('='.repeat(60));
    
    // ElevenLabs may send data in different structures - try to extract
    const body = req.body || {};
    
    // Try different possible field names - ElevenLabs specific fields
    const call_type = body.call_type || body.callType || body.type || body.direction || 
                      body.metadata?.call_type || body.data?.call_type || 
                      body.call?.type || body.call?.direction || 'UNKNOWN';
    
    // Phone number extraction - CRITICAL for SMS
    // For OUTBOUND calls: customer is "to", agent is "from"
    // For INBOUND calls: customer is "from", agent is "to"
    
    // ElevenLabs phone number (the agent's number - NOT the customer)
    const elevenLabsNumber = '+15856678990';
    const twilioNumber = process.env.TWILIO_FROM_NUMBER || elevenLabsNumber;
    
    // Log ALL phone-related fields for debugging
    console.log('=== PHONE EXTRACTION DEBUG ===');
    console.log('body.to:', body.to);
    console.log('body.from:', body.from);
    console.log('body.phone_number:', body.phone_number);
    console.log('body.customer_phone:', body.customer_phone);
    console.log('body.call?.to:', body.call?.to);
    console.log('body.call?.from:', body.call?.from);
    console.log('body.call?.customer_number:', body.call?.customer_number);
    console.log('body.metadata?.to:', body.metadata?.to);
    console.log('body.metadata?.from:', body.metadata?.from);
    console.log('body.analysis?.call_to:', body.analysis?.call_to);
    console.log('body.conversation_initiation_client_data:', JSON.stringify(body.conversation_initiation_client_data));
    console.log('=== END PHONE DEBUG ===');
    
    // Collect all phone-like strings from the payload
    const allPhones = [];
    const collectPhones = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (typeof value === 'string') {
          // Match phone number patterns
          if (value.match(/^\+?[0-9\s\-]{10,20}$/)) {
            const normalized = value.replace(/[\s\-]/g, '');
            allPhones.push({ path: currentPath, value: normalized, original: value });
          }
        } else if (typeof value === 'object' && value !== null) {
          collectPhones(value, currentPath);
        }
      }
    };
    collectPhones(body);
    console.log('All phone numbers found in payload:', allPhones);
    
    // Filter out the ElevenLabs/Twilio agent number to get customer's number
    const customerPhones = allPhones.filter(p => {
      const num = p.value.replace(/\+/g, '');
      const agentNum = elevenLabsNumber.replace(/[\+\s\-]/g, '');
      return !num.includes('15856678990') && num !== agentNum;
    });
    console.log('Customer phones (excluding agent):', customerPhones);
    
    // Select the customer phone
    let phone_number = customerPhones.length > 0 ? customerPhones[0].value : '';
    
    console.log('Selected customer phone:', phone_number);
    console.log('Twilio FROM number:', twilioNumber);
    
    const timestamp = body.timestamp || body.created_at || body.ended_at || 
                      body.metadata?.timestamp || body.call?.ended_at || new Date().toISOString();
    
    // Transcript might be in different locations and formats
    let transcript = '';
    
    // Helper function to extract text from transcript
    const extractTranscriptText = (data) => {
      if (!data) return '';
      if (typeof data === 'string') return data;
      if (Array.isArray(data)) {
        return data.map(item => {
          if (typeof item === 'string') return item;
          if (item.text) return item.text;
          if (item.content) return item.content;
          if (item.message) return item.message;
          if (item.transcript) return item.transcript;
          if (item.role && item.message) return `${item.role}: ${item.message}`;
          return JSON.stringify(item);
        }).join(' ');
      }
      if (typeof data === 'object') {
        // Try common nested structures
        if (data.text) return data.text;
        if (data.content) return data.content;
        if (data.full_transcript) return data.full_transcript;
        if (data.messages) return extractTranscriptText(data.messages);
        return JSON.stringify(data);
      }
      return String(data);
    };
    
    // Try different possible field names for transcript
    transcript = extractTranscriptText(body.transcript) ||
                 extractTranscriptText(body.transcription) ||
                 extractTranscriptText(body.conversation) ||
                 extractTranscriptText(body.messages) ||
                 extractTranscriptText(body.data?.transcript) ||
                 extractTranscriptText(body.analysis?.transcript) ||
                 extractTranscriptText(body.call?.transcript) ||
                 '';
    
    // Ensure transcript is a string
    transcript = String(transcript || '');
    
    console.log(`Extracted - Call Type: ${call_type}`);
    console.log(`Extracted - Phone: ${phone_number}`);
    console.log(`Extracted - Transcript Length: ${transcript.length} chars`);
    console.log(`Extracted - Transcript Preview: ${transcript.substring(0, 500) || 'EMPTY'}...`);
    
    // Log all available keys in payload for debugging
    console.log('Available keys in payload:', Object.keys(body));
    if (body.data) console.log('Keys in body.data:', Object.keys(body.data));
    if (body.call) console.log('Keys in body.call:', Object.keys(body.call));
    if (body.conversation) console.log('Keys in body.conversation:', typeof body.conversation === 'object' ? Object.keys(body.conversation) : 'not object');
    
    // Validate required fields - be lenient for debugging
    if (!transcript) {
      console.log('WARNING: No transcript found. Checking entire payload for text...');
      // Last resort: stringify entire payload and search for text
      const payloadStr = JSON.stringify(body);
      if (payloadStr.length > 100) {
        transcript = payloadStr; // Use full payload as transcript for keyword matching
        console.log('Using full payload as transcript for matching');
      }
    }
    
    if (!phone_number) {
      console.log('WARNING: No phone_number found in standard fields');
      // Try to find phone in nested structures
      const findPhone = (obj, depth = 0) => {
        if (depth > 3 || !obj || typeof obj !== 'object') return null;
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string' && value.match(/^\+?[0-9]{10,15}$/)) {
            console.log(`Found phone-like value in ${key}: ${value}`);
            return value;
          }
          if (typeof value === 'object') {
            const found = findPhone(value, depth + 1);
            if (found) return found;
          }
        }
        return null;
      };
      const foundPhone = findPhone(body);
      if (foundPhone) {
        phone_number = foundPhone; // Actually assign the found phone
        console.log(`Using found phone: ${phone_number}`);
      } else {
        console.log('No phone number found anywhere in payload');
        return res.status(200).json({
          received: true,
          sms_sent: false,
          reason: 'No phone number found in webhook payload',
          payload_keys: Object.keys(body),
        });
      }
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
    
    // Validate phone number is not the same as FROM number
    const fromNumber = process.env.TWILIO_FROM_NUMBER || '';
    const normalizedTo = phone_number.replace(/[\+\s\-]/g, '');
    const normalizedFrom = fromNumber.replace(/[\+\s\-]/g, '');
    
    if (normalizedTo === normalizedFrom || normalizedTo.includes('15856678990')) {
      console.error('CRITICAL: Customer phone matches agent phone - cannot send SMS');
      console.error('This means we failed to extract the customer phone from the webhook');
      console.error('Full payload keys:', Object.keys(body));
      console.error('Full payload:', JSON.stringify(body).substring(0, 2000));
      return res.status(200).json({
        received: true,
        sms_sent: false,
        reason: 'Customer phone not found in webhook - matches agent phone',
        debug: {
          extracted_phone: phone_number,
          twilio_from: fromNumber,
          payload_keys: Object.keys(body),
        },
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
