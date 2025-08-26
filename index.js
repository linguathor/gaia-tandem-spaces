// Load environment variables from the .env file
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.ZOOM_WEBHOOK_SECRET_TOKEN) {
  console.warn('WARNING: ZOOM_WEBHOOK_SECRET_TOKEN is not set. For local testing, copy .env.example to .env and set the token.');
}

// Use Express's built-in JSON parser, but with a verify function
// This captures the raw request body required for signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Webhook endpoint
app.post('/api/zoom-webhook', (req, res) => {
  console.log('Received a request from Zoom...');

  // 1. HANDLE ZOOM'S URL VALIDATION CHALLENGE
  if (req.body && req.body.event === 'endpoint.url_validation') {
    console.log('Responding to URL validation challenge.');

    const plainToken = req.body.payload && req.body.payload.plainToken;
    if (!plainToken) {
      return res.status(400).send('plainToken missing');
    }

    const hashForValidate = crypto
      .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '')
      .update(plainToken)
      .digest('hex');

    return res.status(200).json({
      plainToken,
      encryptedToken: hashForValidate,
    });
  }

  // 2. VERIFY ALL OTHER INCOMING EVENTS
  const signature = req.headers['x-zm-signature'];
  const timestamp = req.headers['x-zm-request-timestamp'];

  if (!signature || !timestamp) {
    console.log('Verification headers missing.');
    return res.status(401).send('Verification failed.');
  }

  const message = `v0:${timestamp}:${req.rawBody.toString()}`;
  const hashForVerify = crypto
    .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '')
    .update(message)
    .digest('hex');
  const expectedSignature = `v0=${hashForVerify}`;

  if (signature !== expectedSignature) {
    console.log('Invalid signature.');
    return res.status(401).send('Verification failed.');
  }

  // 3. PROCESS THE VERIFIED EVENT
  console.log('Webhook verified successfully!');
  console.log('Event Type:', req.body.event);
  console.log('Payload:', JSON.stringify(req.body.payload, null, 2));

  // Placeholder: implement your logic here.

  // Acknowledge receipt of the event
  res.status(200).send('Event received.');
});

// Health check
app.get('/', (req, res) => res.send('Zoom webhook backend is running.'));

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
  console.log(`Health check: http://localhost:${port}/`);
  console.log(`Webhook endpoint: http://localhost:${port}/api/zoom-webhook`);
});
