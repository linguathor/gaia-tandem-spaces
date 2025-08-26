// Load environment variables from the .env file
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.ZOOM_WEBHOOK_SECRET_TOKEN) {
  console.warn('WARNING: ZOOM_WEBHOOK_SECRET_TOKEN is not set. For local testing, copy .env.example to .env and set the token.');
}

if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
  console.warn('WARNING: OPENAI_API_KEY is not set. Add your OpenAI API key to .env for feedback generation.');
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  console.log('Generating feedback using OpenAI...');
  console.log('Transcript length:', transcript.length);
  console.log('Participants:', participants.map(p => p.name).join(', '));
  
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    console.log('OpenAI API key not configured, returning mock feedback');
    return {
      summary: 'Mock meeting summary - OpenAI API key not configured',
      insights: ['Please configure OPENAI_API_KEY in your environment'],
      actionItems: ['Set up OpenAI API key', 'Redeploy the application']
    };
  }
  
  try {
    const participantNames = participants.map(p => p.name).join(', ');
    
    const systemPrompt = `You are an expert meeting analyst specializing in "Spaces" - the gaps between what people say and what they really mean in professional meetings. Your role is to provide actionable feedback that helps participants improve their communication and collaboration.

Analyze the meeting transcript and provide insights in these key areas:

1. **Communication Patterns**: How effectively did participants communicate? Look for:
   - Unclear messaging or assumptions
   - Speaking over each other or interruptions
   - Engagement levels and participation balance
   - Use of jargon that might exclude others

2. **Hidden Dynamics**: Identify the "spaces" between words:
   - Unspoken concerns or hesitations
   - Power dynamics affecting participation
   - Emotional undertones (frustration, enthusiasm, uncertainty)
   - What wasn't said but was probably thought

3. **Collaboration Effectiveness**: Assess how well the team worked together:
   - Decision-making process and clarity
   - How well ideas were built upon
   - Conflict resolution and handling of disagreements
   - Inclusivity and psychological safety

4. **Actionable Improvements**: Provide specific, implementable suggestions:
   - Communication techniques for better clarity
   - Process improvements for future meetings
   - Individual feedback for key participants
   - Ways to address any underlying tensions

Format your response as JSON with these fields:
- summary: A brief overview of the meeting's effectiveness
- communicationInsights: Array of observations about communication patterns
- hiddenDynamics: Array of insights about unspoken elements
- collaborationScore: Number from 1-10 rating team collaboration
- actionItems: Array of specific, actionable recommendations
- individualFeedback: Object with participant names as keys and personalized feedback as values

Keep insights constructive and actionable. Focus on helping the team improve their "spaces" - the quality of interaction beyond just the words spoken.`;

    const userPrompt = `Please analyze this meeting transcript involving participants: ${participantNames}

Transcript:
${transcript}

Provide your analysis in the requested JSON format, focusing on the "spaces" between what was said and what was meant.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const content = response.choices[0].message.content;
    
    try {
      // Try to parse as JSON
      const feedback = JSON.parse(content);
      console.log('Successfully generated feedback with OpenAI');
      return feedback;
    } catch (parseError) {
      console.log('Failed to parse OpenAI response as JSON, returning structured fallback');
      return {
        summary: content.substring(0, 200) + '...',
        communicationInsights: ['OpenAI response was not in expected JSON format'],
        hiddenDynamics: ['Please check the system prompt configuration'],
        collaborationScore: 7,
        actionItems: ['Review and fix the feedback generation prompt'],
        individualFeedback: {}
      };
    }
    
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return {
      summary: 'Error generating feedback with OpenAI',
      communicationInsights: [`API Error: ${error.message}`],
      hiddenDynamics: ['Could not analyze meeting dynamics due to API error'],
      collaborationScore: 0,
      actionItems: ['Fix OpenAI API configuration', 'Check API key and billing'],
      individualFeedback: {}
    };
  }
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
