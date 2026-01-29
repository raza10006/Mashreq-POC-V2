/**
 * Vercel Serverless Function: Outbound Call API
 * POST /api/outbound-call
 */

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { phoneNumber, fullName, preferredLanguage, callReason, contextData } = req.body;

    // Validation
    const errors = [];
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      errors.push('Phone number is required');
    } else if (!phoneNumber.startsWith('+')) {
      errors.push('Phone number must be in E.164 format (e.g., +971...)');
    }
    if (!fullName || typeof fullName !== 'string') {
      errors.push('Full name is required');
    }
    if (!preferredLanguage || typeof preferredLanguage !== 'string') {
      errors.push('Preferred language is required');
    }
    if (!callReason || typeof callReason !== 'string') {
      errors.push('Call reason is required');
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors });
    }

    // Check environment variables
    if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_AGENT_ID || !process.env.ELEVENLABS_PHONE_NUMBER_ID) {
      return res.status(500).json({ 
        success: false, 
        error: 'Server configuration error', 
        message: 'Missing environment variables' 
      });
    }

    // Build outbound context
    const outboundContext = {
      callType: 'OUTBOUND',
      customer: { fullName, preferredLanguage },
      reason: callReason,
      contextData: contextData || {},
      rules: {
        noAuthentication: true,
        noDataCollection: true,
        noComplaintCreation: true,
      },
    };

    // Build first message based on language
    const firstName = fullName.split(' ')[0];
    const isArabic = preferredLanguage.toLowerCase().includes('arabic');
    const firstMessage = isArabic
      ? `مرحباً ${firstName}، أنا مساعد ماشرق الذكي. أتصل بك اليوم بخصوص ${callReason}.`
      : `Hello ${firstName}, this is Mashreq AI Assistant. I'm calling you today regarding ${callReason}.`;

    // Build conversation initiation data
    const dynamicVars = {
      customer_name: fullName,
      customer_first_name: firstName,
      preferred_language: preferredLanguage,
      call_type: 'OUTBOUND',
      call_reason: callReason,
      outbound_context: JSON.stringify(outboundContext),
      suggested_greeting: firstMessage,
    };

    // Add context data as dynamic variables
    if (contextData && typeof contextData === 'object') {
      Object.entries(contextData).forEach(([key, value]) => {
        dynamicVars[`context_${key}`] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      });
    }

    const requestBody = {
      agent_id: process.env.ELEVENLABS_AGENT_ID,
      agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
      to_number: phoneNumber,
      conversation_initiation_client_data: {
        dynamic_variables: dynamicVars,
        conversation_config_override: {
          agent: {
            first_message: firstMessage,
          },
        },
      },
    };

    const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.detail?.message || data.detail || data.message || JSON.stringify(data);
      return res.status(response.status).json({
        success: false,
        error: 'ElevenLabs API error',
        message: errorMessage,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Outbound call initiated successfully',
      data: {
        conversationId: data.conversation_id,
        callSid: data.callSid,
        phoneNumber,
        customer: fullName,
        callReason,
        outboundContext,
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to initiate outbound call',
      message: error.message,
    });
  }
};
