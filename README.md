# Mashreq Outbound Call Controller

A simple PoC application that initiates outbound AI voice calls using ElevenLabs Conversational AI with injected customer context.

## Overview

This controller app allows you to:
- Initiate outbound calls to customers via ElevenLabs AI Voice Agent
- Inject customer context (name, language, call reason, additional data)
- Pass rules to the agent (no authentication, no data collection, etc.)

**Note:** This is a controller only. The AI agent, system prompts, knowledge base, and customer data are already configured in ElevenLabs.

## Prerequisites

1. An ElevenLabs account with Conversational AI access
2. A deployed ElevenLabs AI Voice Agent
3. A Twilio phone number connected to your ElevenLabs account
4. Node.js 18+ installed

---

## Deployment Options

### Option 1: Deploy to Vercel (Recommended)

#### Quick Deploy

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel --prod
   ```

4. Add environment variables in Vercel Dashboard:
   - Go to your project → Settings → Environment Variables
   - Add these variables:
     - `ELEVENLABS_API_KEY`
     - `ELEVENLABS_AGENT_ID`
     - `ELEVENLABS_PHONE_NUMBER_ID`

#### Local Development with Vercel

```bash
npm run vercel-dev
```

---

### Option 2: Local Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Get your API key from: https://elevenlabs.io/app/settings/api-keys
ELEVENLABS_API_KEY=your_api_key_here

# Get your Agent ID from your ElevenLabs dashboard
ELEVENLABS_AGENT_ID=your_agent_id_here

# Get this from your ElevenLabs dashboard under Telephony settings
ELEVENLABS_PHONE_NUMBER_ID=your_phone_number_id_here

# Server port (optional, defaults to 3000)
PORT=3000
```

### Where to Find Your Credentials

1. **API Key**: Go to [ElevenLabs Settings > API Keys](https://elevenlabs.io/app/settings/api-keys)
2. **Agent ID**: Go to your [Agents Dashboard](https://elevenlabs.io/app/conversational-ai), click on your agent, and find the Agent ID in the URL or settings
3. **Phone Number ID**: Go to your agent's Telephony settings, find your connected Twilio number, and copy its ID

### 3. Start the Server

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

## API Usage

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-29T10:00:00.000Z"
}
```

### Initiate Outbound Call

```bash
curl -X POST http://localhost:3000/outbound-call \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+9718600883826",
    "fullName": "Yousef Sheikh",
    "preferredLanguage": "UAE Arabic",
    "callReason": "Complaint Resolution Update",
    "contextData": {
      "complaintStatus": "Resolved",
      "resolutionDate": "2026-01-15",
      "resolutionSummary": "Transaction dispute resolved in customer favor"
    }
  }'
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `phoneNumber` | string | Yes | Phone number in E.164 format (e.g., `+9718600883826`) |
| `fullName` | string | Yes | Customer's full name |
| `preferredLanguage` | string | Yes | Customer's preferred language (e.g., `UAE Arabic`, `English`) |
| `callReason` | string | Yes | Purpose of the call |
| `contextData` | object | No | Additional context data to pass to the agent |

### Successful Response

```json
{
  "success": true,
  "message": "Outbound call initiated successfully",
  "data": {
    "conversationId": "conv_abc123",
    "callSid": "CA1234567890abcdef",
    "phoneNumber": "+9718600883826",
    "customer": "Yousef Sheikh",
    "callReason": "Complaint Resolution Update",
    "outboundContext": {
      "callType": "OUTBOUND",
      "customer": {
        "fullName": "Yousef Sheikh",
        "preferredLanguage": "UAE Arabic"
      },
      "reason": "Complaint Resolution Update",
      "contextData": {
        "complaintStatus": "Resolved",
        "resolutionDate": "2026-01-15",
        "resolutionSummary": "Transaction dispute resolved in customer favor"
      },
      "rules": {
        "noAuthentication": true,
        "noDataCollection": true,
        "noComplaintCreation": true
      }
    }
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    "phoneNumber must be in E.164 format (e.g., +9718600883826)"
  ]
}
```

## Example Use Cases

### 1. Complaint Resolution Update

```bash
curl -X POST http://localhost:3000/outbound-call \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+9718600883826",
    "fullName": "Yousef Sheikh",
    "preferredLanguage": "UAE Arabic",
    "callReason": "Complaint Resolution Update",
    "contextData": {
      "complaintStatus": "Resolved",
      "resolutionDate": "2026-01-15",
      "resolutionSummary": "Transaction dispute resolved in customer favor"
    }
  }'
```

### 2. Rewards Points Notification

```bash
curl -X POST http://localhost:3000/outbound-call \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+9715012345678",
    "fullName": "Ahmed Al Mansouri",
    "preferredLanguage": "English",
    "callReason": "Rewards Points Expiry Reminder",
    "contextData": {
      "pointsBalance": 15000,
      "expiryDate": "2026-02-15",
      "redemptionOptions": "Travel vouchers, cashback, or gift cards"
    }
  }'
```

### 3. Account Update Confirmation

```bash
curl -X POST http://localhost:3000/outbound-call \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+9714987654321",
    "fullName": "Sara Hassan",
    "preferredLanguage": "UAE Arabic",
    "callReason": "Account Update Confirmation",
    "contextData": {
      "updateType": "Contact Information",
      "updateDate": "2026-01-28",
      "updatedFields": "Email address and mobile number"
    }
  }'
```

## How It Works

1. **Receive Request**: The `/outbound-call` endpoint receives the call request with customer details
2. **Build Context**: The app constructs an outbound context object with customer info and rules
3. **Prepare Call**: Dynamic variables and first message are prepared based on language preference
4. **Initiate Call**: The app calls ElevenLabs Twilio outbound API with the context
5. **Agent Takes Over**: ElevenLabs AI agent receives the context and handles the conversation

## Context Injection

The outbound context is injected into the agent session via `dynamic_variables`:

- `customer_name` - Full customer name
- `customer_first_name` - First name for greeting
- `preferred_language` - Language preference
- `call_type` - Always "OUTBOUND"
- `call_reason` - Purpose of the call
- `outbound_context` - Full JSON context object
- `context_*` - Individual fields from contextData (prefixed with `context_`)

## Rules Enforcement

The context includes rules that the agent must follow:

- `noAuthentication: true` - Agent must NOT ask authentication questions
- `noDataCollection: true` - Agent must NOT collect sensitive information
- `noComplaintCreation: true` - Agent must NOT create new complaints

These rules are passed to the agent via the context, and your agent's system prompt should be configured to respect these rules when they are present.

## Project Structure

```
mashreq-outbound-call-controller/
├── api/
│   └── outbound-call.js  # Vercel serverless function
├── public/
│   └── index.html        # Web interface
├── src/
│   └── index.js          # Express server (local development)
├── .env.example          # Environment variables template
├── .env                  # Your environment variables (create this)
├── vercel.json           # Vercel configuration
├── package.json          # Dependencies
└── README.md             # This file
```

## Troubleshooting

### "Missing required environment variables"

Make sure you've created `.env` file and filled in all required values.

### "Failed to initiate outbound call"

Check that:
1. Your ElevenLabs API key is valid
2. Your Agent ID exists and is active
3. Your Phone Number ID is correct and the number is connected to Twilio
4. The destination phone number is in E.164 format

### Call initiated but agent behaves unexpectedly

Ensure your ElevenLabs agent's system prompt is configured to:
1. Check for `outbound_context` or `call_type` variables
2. Respect the rules when call_type is "OUTBOUND"
3. Use the provided context data appropriately

## License

ISC
