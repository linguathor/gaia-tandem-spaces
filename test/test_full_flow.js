// Test script for full transcript completion webhook flow
require('dotenv').config();
const http = require('http');
const crypto = require('crypto');

const SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test-secret';

// Mock transcript completion event payload
const payload = {
  event: 'recording.transcript_completed',
  payload: {
    account_id: 'test-account',
    object: {
      uuid: 'test-meeting-uuid-123',
      id: 'test-recording-id',
      host_id: 'test-host-id',
      topic: 'Sprint Planning Meeting',
      start_time: '2024-01-15T10:00:00Z',
      recording_files: [
        {
          id: 'audio-file-id',
          file_type: 'audio_only',
          file_size: 15728640, // ~15MB
          download_url: 'https://api.zoom.us/v2/recordings/test-recording-id/audio_only',
          status: 'completed'
        },
        {
          id: 'transcript-file-id',
          file_type: 'transcript',
          file_size: 1024,
          download_url: 'https://api.zoom.us/v2/recordings/test-recording-id/transcript',
          status: 'completed'
        }
      ]
    }
  }
};

// First, let's add some participants to the meeting
const participantJoinedPayload = {
  event: 'meeting.participant_joined',
  payload: {
    account_id: 'test-account',
    object: {
      uuid: 'test-meeting-uuid-123',
      id: 'test-meeting-id',
      participant: {
        user_id: '1',
        user_name: 'John Smith',
        email: 'john.smith@company.com'
      }
    }
  }
};

function sendWebhookEvent(eventPayload, description) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(eventPayload);
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

    console.log(`\n📤 Sending ${description}...`);
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`✅ Status: ${res.statusCode}`);
        console.log(`📝 Response: ${data}`);
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (err) => {
      console.error(`❌ Request error: ${err.message}`);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

async function testFullFlow() {
  console.log('🚀 Testing full transcript completion webhook flow...');
  console.log('📍 Make sure the server is running on localhost:3000');
  
  try {
    // Step 1: Add participant to meeting
    await sendWebhookEvent(participantJoinedPayload, 'participant joined event');
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 2: Trigger transcript completion (this should trigger OpenAI analysis)
    await sendWebhookEvent(payload, 'transcript completion event');
    
    console.log('\n🎉 Full webhook flow test completed!');
    console.log('💡 Check the server logs to see the OpenAI feedback generation');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('💡 Make sure the server is running: npm start');
  }
}

// Run the test
testFullFlow().catch(console.error);
