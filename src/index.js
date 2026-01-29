/**
 * Mashreq Outbound Call Controller
 * 
 * A simple PoC application that initiates outbound AI voice calls
 * using ElevenLabs Conversational AI with injected customer context.
 */

require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

// Configuration
const CONFIG = {
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
  elevenLabsAgentId: process.env.ELEVENLABS_AGENT_ID,
  elevenLabsPhoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID,
  port: process.env.PORT || 3000,
};

// Validate required environment variables
function validateConfig() {
  const required = ['elevenLabsApiKey', 'elevenLabsAgentId', 'elevenLabsPhoneNumberId'];
  const missing = required.filter(key => !CONFIG[key]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    console.error('\nPlease copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

/**
 * Constructs the outbound context object for the AI agent
 * This context tells the agent about the call purpose and rules
 */
function buildOutboundContext(input) {
  return {
    callType: 'OUTBOUND',
    customer: {
      fullName: input.fullName,
      preferredLanguage: input.preferredLanguage,
    },
    reason: input.callReason,
    contextData: input.contextData || {},
    rules: {
      noAuthentication: true,
      noDataCollection: true,
      noComplaintCreation: true,
    },
  };
}

/**
 * Builds the first message for the agent based on the call reason and language
 */
function buildFirstMessage(input) {
  const { fullName, preferredLanguage, callReason } = input;
  const firstName = fullName.split(' ')[0];
  
  // Customize greeting based on language preference
  if (preferredLanguage.toLowerCase().includes('arabic')) {
    return `مرحباً ${firstName}، أنا مساعد ماشرق الذكي. أتصل بك اليوم بخصوص ${callReason}.`;
  }
  
  return `Hello ${firstName}, this is Mashreq AI Assistant. I'm calling you today regarding ${callReason}.`;
}

/**
 * Initiates an outbound call via ElevenLabs Twilio integration
 */
async function initiateOutboundCall(input) {
  const outboundContext = buildOutboundContext(input);
  const firstMessage = buildFirstMessage(input);
  
  // Build the conversation initiation data with dynamic variables
  const conversationInitiationClientData = {
    dynamic_variables: {
      // Customer information
      customer_name: input.fullName,
      customer_first_name: input.fullName.split(' ')[0],
      preferred_language: input.preferredLanguage,
      
      // Call context
      call_type: 'OUTBOUND',
      call_reason: input.callReason,
      
      // Stringify the full context for the agent
      outbound_context: JSON.stringify(outboundContext),
      
      // Individual context data fields (flatten for easier template access)
      ...Object.entries(input.contextData || {}).reduce((acc, [key, value]) => {
        acc[`context_${key}`] = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return acc;
      }, {}),
    },
    conversation_config_override: {
      agent: {
        first_message: firstMessage,
        language: input.preferredLanguage.toLowerCase().includes('arabic') ? 'ar' : 'en',
      },
    },
  };

  const requestBody = {
    agent_id: CONFIG.elevenLabsAgentId,
    agent_phone_number_id: CONFIG.elevenLabsPhoneNumberId,
    to_number: input.phoneNumber,
    conversation_initiation_client_data: conversationInitiationClientData,
  };

  console.log('Initiating outbound call:', {
    to: input.phoneNumber,
    customer: input.fullName,
    reason: input.callReason,
  });

  const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': CONFIG.elevenLabsApiKey,
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail?.message || data.message || 'Failed to initiate outbound call');
  }

  return data;
}

/**
 * Validates the incoming request payload
 */
function validateRequest(body) {
  const errors = [];
  
  if (!body.phoneNumber || typeof body.phoneNumber !== 'string') {
    errors.push('phoneNumber is required and must be a string');
  } else if (!body.phoneNumber.startsWith('+')) {
    errors.push('phoneNumber must be in E.164 format (e.g., +9718600883826)');
  }
  
  if (!body.fullName || typeof body.fullName !== 'string') {
    errors.push('fullName is required and must be a string');
  }
  
  if (!body.preferredLanguage || typeof body.preferredLanguage !== 'string') {
    errors.push('preferredLanguage is required and must be a string');
  }
  
  if (!body.callReason || typeof body.callReason !== 'string') {
    errors.push('callReason is required and must be a string');
  }
  
  if (body.contextData && typeof body.contextData !== 'object') {
    errors.push('contextData must be an object if provided');
  }
  
  return errors;
}

// ============================================================================
// API Routes
// ============================================================================

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /outbound-call
 * 
 * Initiates an outbound AI voice call with customer context
 * 
 * Request Body:
 * {
 *   "phoneNumber": "+9718600883826",
 *   "fullName": "Yousef Sheikh",
 *   "preferredLanguage": "UAE Arabic",
 *   "callReason": "Complaint Resolution Update",
 *   "contextData": {
 *     "complaintStatus": "Resolved",
 *     "resolutionDate": "2026-01-15",
 *     "resolutionSummary": "Transaction dispute resolved in customer's favor"
 *   }
 * }
 */
app.post('/outbound-call', async (req, res) => {
  try {
    // Validate request
    const validationErrors = validateRequest(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationErrors,
      });
    }

    // Initiate the call
    const result = await initiateOutboundCall(req.body);

    // Build the outbound context for the response
    const outboundContext = buildOutboundContext(req.body);

    res.json({
      success: true,
      message: 'Outbound call initiated successfully',
      data: {
        conversationId: result.conversation_id,
        callSid: result.callSid,
        phoneNumber: req.body.phoneNumber,
        customer: req.body.fullName,
        callReason: req.body.callReason,
        outboundContext: outboundContext,
      },
    });
  } catch (error) {
    console.error('Error initiating outbound call:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Failed to initiate outbound call',
      message: error.message,
    });
  }
});

// ============================================================================
// Server Startup
// ============================================================================

validateConfig();

app.listen(CONFIG.port, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Mashreq Outbound Call Controller                       ║
╠════════════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${CONFIG.port}                     ║
║                                                                ║
║  Endpoints:                                                    ║
║    GET  /health        - Health check                          ║
║    POST /outbound-call - Initiate outbound call                ║
╚════════════════════════════════════════════════════════════════╝
  `);
});
