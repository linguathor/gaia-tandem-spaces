# Zoom Feedback Backend - "Spaces" Meeting Analysis

Advanced Express server that processes Zoom webhook events and generates AI-powered feedback focusing on the "spaces" between what people say and what they mean in meetings.

## Quick start (PowerShell):

```powershell
# From workspace root
Set-Location .\zoom-feedback-backend
npm install

# Copy .env.example to .env and configure your API keys
Copy-Item .env.example .env
# Edit .env and set:
# - ZOOM_WEBHOOK_SECRET_TOKEN (from your Zoom App settings)
# - OPENAI_API_KEY (from OpenAI dashboard: https://platform.openai.com/api-keys)

# Start server in background:
Start-Process -FilePath "node" -ArgumentList ".\index.js" -WorkingDirectory "." -WindowStyle Hidden

# Or start in foreground:
node .\index.js
```

## Testing:

```powershell
# Test webhook endpoints
npm run test:signed        # Test with signed event
npm run test:validation    # Test URL validation

# Test OpenAI integration
npm run test:openai        # Test feedback generation (requires OpenAI API key)
```

## Environment Variables:

- `ZOOM_WEBHOOK_SECRET_TOKEN`: Your Zoom webhook secret token
- `OPENAI_API_KEY`: Your OpenAI API key (starts with sk-...)
- `PORT`: Server port (default: 3000)

## Features:

### ✅ Zoom Integration
- Webhook verification and URL validation
- Participant tracking across meeting lifecycle  
- Recording and transcript completion handling

### ✅ AI-Powered Analysis
- **"Spaces" Focus**: Analyzes gaps between spoken words and intended meaning
- **Communication Patterns**: Identifies unclear messaging, interruptions, engagement levels
- **Hidden Dynamics**: Uncovers unspoken concerns, power dynamics, emotional undertones
- **Collaboration Assessment**: Rates team effectiveness and decision-making processes
- **Actionable Insights**: Provides specific, implementable recommendations

### 🚧 Coming Next
- Zoom API integration for transcript download
- Email/Telegram delivery system
- Database storage for persistent data

## Production Deployment:

For Vercel deployment:
1. Push to GitHub (`.env` is already in `.gitignore`)
2. Import project in Vercel dashboard
3. Set environment variables in Vercel project settings
4. Use webhook URL: `https://your-project.vercel.app/api/zoom-webhook`

## Event Flow:

1. **Meeting starts** → Participants tracked via webhook events
2. **Recording completes** → System logs recording files availability  
3. **Transcript ready** → **Main trigger** for analysis:
   - Downloads transcript from Zoom
   - Generates AI feedback using OpenAI GPT-4
   - Delivers personalized insights to participants
   - Cleans up meeting data

## Testing with ngrok (for local Zoom integration):

```powershell
ngrok http 3000
# Use: https://your-ngrok-id.ngrok.io/api/zoom-webhook
```
