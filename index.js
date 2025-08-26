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
app.post('/api/zoom-webhook', async (req, res) => {
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

  const eventType = req.body.event;
  const payload = req.body.payload;

  try {
    switch (eventType) {
      case 'meeting.participant_joined':
      case 'meeting.participant_left':
        await handleParticipantEvent(eventType, payload);
        break;

      case 'recording.completed':
        await handleRecordingCompleted(payload);
        break;

      case 'recording.transcript_completed':
        await handleTranscriptCompleted(payload);
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }
  } catch (error) {
    console.error('Error processing webhook event:', error);
    return res.status(500).send('Internal server error');
  }

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

// =============================================================================
// ZOOM EVENT HANDLERS
// =============================================================================

/**
 * Simple in-memory storage for meeting participants (use database in production)
 */
const meetingParticipants = new Map();

/**
 * Handle participant join/leave events
 */
async function handleParticipantEvent(eventType, payload) {
  const meetingUuid = payload.object?.uuid;
  const participant = payload.object?.participant;
  
  if (!meetingUuid || !participant) {
    console.log('Missing meeting UUID or participant data');
    return;
  }

  console.log(`${eventType}: ${participant.user_name} (${participant.user_id})`);
  
  // Store or update participant list for this meeting
  if (!meetingParticipants.has(meetingUuid)) {
    meetingParticipants.set(meetingUuid, new Set());
  }
  
  const participants = meetingParticipants.get(meetingUuid);
  
  if (eventType === 'meeting.participant_joined') {
    participants.add({
      id: participant.user_id,
      name: participant.user_name,
      email: participant.email || null,
      joinTime: new Date().toISOString()
    });
  } else if (eventType === 'meeting.participant_left') {
    // Remove participant (in production, you might want to track join/leave times)
    for (const p of participants) {
      if (p.id === participant.user_id) {
        participants.delete(p);
        break;
      }
    }
  }
  
  console.log(`Meeting ${meetingUuid} now has ${participants.size} participants`);
}

/**
 * Handle recording completion - recording file is ready
 */
async function handleRecordingCompleted(payload) {
  const meetingUuid = payload.object?.uuid;
  const recordingFiles = payload.object?.recording_files || [];
  
  console.log(`Recording completed for meeting ${meetingUuid}`);
  console.log(`Recording files: ${recordingFiles.length}`);
  
  // Store recording info for later use when transcript is ready
  // In production, save to database
  
  for (const file of recordingFiles) {
    console.log(`- ${file.file_type}: ${file.download_url}`);
  }
}

/**
 * Handle transcript completion - this is the main trigger for feedback generation
 */
async function handleTranscriptCompleted(payload) {
  const meetingUuid = payload.object?.uuid;
  const transcriptFile = payload.object?.recording_files?.find(f => f.file_type === 'transcript');
  
  if (!transcriptFile) {
    console.log('No transcript file found in payload');
    return;
  }
  
  console.log(`Transcript ready for meeting ${meetingUuid}`);
  console.log(`Transcript download URL: ${transcriptFile.download_url}`);
  
  try {
    // Step 1: Get participant list for this meeting
    const participants = meetingParticipants.get(meetingUuid);
    if (!participants || participants.size === 0) {
      console.log(`No participants found for meeting ${meetingUuid}`);
      return;
    }
    
    console.log(`Processing feedback for ${participants.size} participants`);
    
    // Step 2: Download transcript
    const transcript = await downloadTranscript(transcriptFile.download_url);
    
    // Step 3: Generate feedback using OpenAI
    const feedback = await generateFeedback(transcript, Array.from(participants));
    
    // Step 4: Send feedback to participants
    await sendFeedbackToParticipants(feedback, Array.from(participants));
    
    // Clean up participant data
    meetingParticipants.delete(meetingUuid);
    
  } catch (error) {
    console.error('Error processing transcript:', error);
  }
}

/**
 * Download transcript from Zoom (requires access token)
 */
async function downloadTranscript(downloadUrl) {
  console.log('TODO: Download transcript from Zoom API');
  console.log('URL:', downloadUrl);
  
  // TODO: Implement actual download with Zoom access token
  // const response = await fetch(downloadUrl, {
  //   headers: { 'Authorization': `Bearer ${zoomAccessToken}` }
  // });
  // const transcript = await response.text();
  
  return 'Sample transcript content...';
}

/**
 * Generate feedback using OpenAI API
 */
async function generateFeedback(transcript, participants) {
  console.log('TODO: Generate feedback using OpenAI');
  console.log('Transcript length:', transcript.length);
  console.log('Participants:', participants.map(p => p.name).join(', '));
  
  // TODO: Implement OpenAI API call
  // const response = await openai.chat.completions.create({
  //   model: "gpt-4",
  //   messages: [
  //     { role: "system", content: "You are a meeting feedback analyst..." },
  //     { role: "user", content: `Analyze this transcript: ${transcript}` }
  //   ]
  // });
  
  return {
    summary: 'Sample meeting summary...',
    insights: ['Insight 1', 'Insight 2'],
    actionItems: ['Action 1', 'Action 2']
  };
}

/**
 * Send feedback to participants via email/Telegram
 */
async function sendFeedbackToParticipants(feedback, participants) {
  console.log('TODO: Send feedback to participants');
  console.log('Feedback:', feedback);
  
  for (const participant of participants) {
    console.log(`Sending feedback to ${participant.name} (${participant.email || 'no email'})`);
    
    // TODO: Implement email/Telegram delivery
    // if (participant.email) {
    //   await sendEmail(participant.email, feedback);
    // }
    // await sendTelegramMessage(participant.name, feedback);
  }
}
