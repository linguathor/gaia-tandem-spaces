# Zoom Feedback Backend - German Tandem Learning Assistant

Advanced Express server that processes Zoom webhook events and generates AI-powered feedback for German language learners in tandem conversations. Provides personalized analysis of grammar, vocabulary, fluency, and communication skills.

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

# Test Whisper transcription integration (requires OpenAI key)
npm run test:whisper       # Test Whisper API connectivity
npm run test:openai        # Test feedback generation (requires OpenAI API key)
npm run test:zoom          # Test Zoom API access (requires Zoom credentials)
npm run test:flow          # Test complete webhook flow
```

## Environment Variables:

- `ZOOM_WEBHOOK_SECRET_TOKEN`: Your Zoom webhook secret token
- `ZOOM_CLIENT_ID`: Your Zoom app Client ID (for API access)
- `ZOOM_CLIENT_SECRET`: Your Zoom app Client Secret (for API access)  
- `OPENAI_API_KEY`: Your OpenAI API key (starts with sk-...) - used for both Whisper transcription and GPT analysis
- `OPENAI_MODEL`: OpenAI model to use for analysis (default: gpt-4o-mini)
- `PORT`: Server port (default: 3000)

## Getting Zoom API Credentials:

1. Go to [Zoom Marketplace](https://marketplace.zoom.us/develop/create)
2. Create a **Server-to-Server OAuth** app
3. Get your **Client ID** and **Client Secret** from the app credentials
4. Add these to your `.env` file

## Features:

### ✅ Zoom Integration
- Webhook verification and URL validation
- Participant tracking across meeting lifecycle  
- Recording and transcript completion handling
- **Server-to-Server OAuth** for API authentication
- **Enhanced Audio Transcription** using OpenAI Whisper API for superior accuracy
- **Automatic audio file download** from Zoom recordings (audio_only or video files)
- **Speaker-aware transcription** with participant name hints for better identification

### ✅ AI-Powered German Language Analysis
- **Personalized Feedback**: Individual analysis for each speaker's German proficiency
- **Grammar Assessment**: Detailed evaluation of grammar, sentence structure, and common errors
- **Vocabulary Insights**: Analysis of word choice, idiomatic expressions, and register
- **Fluency Evaluation**: Assessment of speaking flow, naturalness, and communication effectiveness
- **Level Estimation**: Automatic CEFR level estimation (A1-C2)
- **Actionable Improvements**: Specific, practical tips with examples from the conversation
- **Learning Resources**: Customized exercise and resource recommendations

### 🚧 Coming Next
- Email/Telegram delivery system
- Database storage for persistent data
- Enhanced error handling and retry logic

## Production Deployment:

For Vercel deployment:
1. Push to GitHub (`.env` is already in `.gitignore`)
2. Import project in Vercel dashboard
3. Set environment variables in Vercel project settings
4. Use webhook URL: `https://your-project.vercel.app/api/zoom-webhook`

## Event Flow:

1. **Meeting starts** → Participants tracked via webhook events
2. **Recording completes** → System logs recording files availability  
3. **Audio transcription ready** → **Main trigger** for analysis:
   - Downloads high-quality audio files from Zoom recordings
   - Transcribes audio using OpenAI Whisper API with speaker identification
   - Generates AI feedback using OpenAI GPT-4o-mini
   - Delivers personalized insights to participants
   - Cleans up meeting data

## Testing with ngrok (for local Zoom integration):

```powershell
ngrok http 3000
# Use: https://your-ngrok-id.ngrok.io/api/zoom-webhook
```
