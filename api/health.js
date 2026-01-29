module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: {
      hasApiKey: !!process.env.ELEVENLABS_API_KEY,
      hasAgentId: !!process.env.ELEVENLABS_AGENT_ID,
      hasPhoneId: !!process.env.ELEVENLABS_PHONE_NUMBER_ID
    }
  });
};
