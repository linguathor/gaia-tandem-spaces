// A small helper to send a properly signed Zoom webhook request to the local server.
// Usage: set ZOOM_WEBHOOK_SECRET_TOKEN in .env or environment, then run:
// node test/send_signed_event.js

require('dotenv').config();
const crypto = require('crypto');
const http = require('http');

const SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test-secret';
const payload = {
  event: 'meeting.participant_joined',
  payload: {
    participant: { id: 'p-123', name: 'Test User' },
    meeting: { id: 'm-456' }
  }
};

const body = JSON.stringify(payload);
const timestamp = Math.floor(Date.now() / 1000).toString();
const message = `v0:${timestamp}:${body}`;
const hash = crypto.createHmac('sha256', SECRET).update(message).digest('hex');
const signature = `v0=${hash}`;

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/zoom-webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'x-zm-request-timestamp': timestamp,
    'x-zm-signature': signature
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (err) => console.error('Request error:', err));
req.write(body);
req.end();
