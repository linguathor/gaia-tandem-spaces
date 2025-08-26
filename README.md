# Zoom Feedback Backend (minimal)

Simple Express server that verifies Zoom webhook signatures and handles the URL validation challenge.

## Quick start (PowerShell):

```powershell
# From workspace root
Set-Location .\zoom-feedback-backend
npm install

# Copy .env.example to .env and set ZOOM_WEBHOOK_SECRET_TOKEN
Copy-Item .env.example .env
# Edit .env and replace 'your_secret_token_here' with your actual Zoom webhook secret

# Start server in background:
Start-Process -FilePath "node" -ArgumentList ".\index.js" -WorkingDirectory "." -WindowStyle Hidden

# Or start in foreground:
node .\index.js

# Test endpoints:
npm run test:signed        # Test with signed event
npm run test:validation    # Test URL validation
```

## Testing manually:

```powershell
# Health check
Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing

# Test URL validation (what Zoom sends first)
$body = '{"event":"endpoint.url_validation","payload":{"plainToken":"test-token-123"}}'
Invoke-RestMethod -Uri "http://localhost:3000/api/zoom-webhook" -Method POST -Body $body -ContentType "application/json"

# Test signed event (simulates real Zoom webhook)
node .\test\send_signed_event.js
```

## For production/Zoom integration:

If you want to expose locally to Zoom for real verification, use ngrok:

```powershell
ngrok http 3000
```

Then in Zoom set the Event notification endpoint to: `https://<ngrok-host>.ngrok.io/api/zoom-webhook`

## Notes:
- Do NOT commit your real `.env` file. Use the hosting provider's environment variable settings for production (Vercel, Heroku, etc.).
- The server responds to both URL validation challenges and signed webhook events.
- All webhook events except URL validation require valid HMAC signature verification.
