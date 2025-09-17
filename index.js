// Load environment variables from the .env file
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const OpenAI = require('openai');
const axios = require('axios');

// Force Vercel redeploy - 2025-09-17

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.ZOOM_WEBHOOK_SECRET_TOKEN) {
  console.warn('WARNING: ZOOM_WEBHOOK_SECRET_TOKEN is not set. For local testing, copy .env.example to .env and set the token.');
}

if (!process.env.ZOOM_CLIENT_ID || process.env.ZOOM_CLIENT_ID === 'your_zoom_client_id_here') {
  console.warn('WARNING: ZOOM_CLIENT_ID is not set. Add your Zoom app Client ID to .env for API access.');
}

if (!process.env.ZOOM_CLIENT_SECRET || process.env.ZOOM_CLIENT_SECRET === 'your_zoom_client_secret_here') {
  console.warn('WARNING: ZOOM_CLIENT_SECRET is not set. Add your Zoom app Client Secret to .env for API access.');
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
// ZOOM API INTEGRATION
// =============================================================================

/**
 * Cache for Zoom access token (in production, use Redis or database)
 */
let zoomAccessTokenCache = {
  token: null,
  expiresAt: 0
};

/**
 * Get Zoom access token using Server-to-Server OAuth
 */
async function getZoomAccessToken(forceRefresh = false) {
  // Force refresh or check if we have a valid cached token
  if (!forceRefresh && zoomAccessTokenCache.token && Date.now() < zoomAccessTokenCache.expiresAt) {
    console.log('Using cached Zoom access token');
    return zoomAccessTokenCache.token;
  }

  if (forceRefresh) {
    console.log('Force refreshing Zoom access token (clearing cache)');
    zoomAccessTokenCache = { token: null, expiresAt: 0 };
  }

  if (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET) {
    throw new Error('Zoom API credentials not configured. Set ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET in .env');
  }

  try {
    console.log('=== ZOOM TOKEN DEBUG START ===');
    console.log('Requesting new Zoom access token with client_credentials for cloud recording access');
    console.log('Using Client ID:', process.env.ZOOM_CLIENT_ID);
    console.log('Client Secret length:', process.env.ZOOM_CLIENT_SECRET?.length || 0);
    console.log('Client Secret first 10 chars:', process.env.ZOOM_CLIENT_SECRET?.substring(0, 10) + '...');
    console.log('Process env keys containing ZOOM:', Object.keys(process.env).filter(k => k.includes('ZOOM')));
    console.log('Current timestamp:', new Date().toISOString());
    console.log('Node.js version:', process.version);
    console.log('Environment:', process.env.NODE_ENV || 'undefined');
    
    const credentials = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
    
    console.log('Making OAuth request to:', 'https://zoom.us/oauth/token');
    console.log('Request body:', 'grant_type=client_credentials');
    console.log('Authorization header first 30 chars:', `Basic ${credentials.substring(0, 30)}...`);
    console.log('Full credentials length:', credentials.length);
    
    // Log request details
    const requestConfig = {
      url: 'https://zoom.us/oauth/token',
      method: 'POST',
      data: 'grant_type=client_credentials',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Node.js Zoom Webhook Server',
        'Accept': 'application/json'
      }
    };
    
    console.log('Full request config (headers masked):', {
      ...requestConfig,
      headers: {
        ...requestConfig.headers,
        'Authorization': 'Basic [MASKED]'
      }
    });
    
    const response = await axios.post(
      'https://zoom.us/oauth/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Node.js Zoom Webhook Server',
          'Accept': 'application/json'
        },
        timeout: 10000,
        validateStatus: function (status) {
          console.log('Response status code:', status);
          return status >= 200 && status < 300;
        }
      }
    );

    console.log('Response received!');
    console.log('Response status:', response.status);
    console.log('Response headers:', JSON.stringify(response.headers, null, 2));
    console.log('Response data type:', typeof response.data);
    console.log('Response data keys:', Object.keys(response.data || {}));

    const { access_token, expires_in, scope, token_type } = response.data;
    
    console.log('=== TOKEN DETAILS ===');
    console.log('Access token present:', !!access_token);
    console.log('Access token length:', access_token?.length || 0);
    console.log('Access token first 20 chars:', access_token?.substring(0, 20) + '...');
    console.log('Token type:', token_type);
    console.log('Expires in seconds:', expires_in);
    console.log('Expires at:', new Date(Date.now() + (expires_in * 1000)).toISOString());
    console.log('=== SCOPE ANALYSIS ===');
    console.log('Full scope string length:', scope?.length || 0);
    console.log('Full scope string:', scope);
    console.log('Scope contains "cloud_recording":', scope?.includes('cloud_recording') || false);
    console.log('Scope contains "marketplace":', scope?.includes('marketplace') || false);
    console.log('Scope contains "recording:read":', scope?.includes('recording:read') || false);
    console.log('Individual scopes:', scope?.split(' ') || []);
    console.log('Number of scopes:', scope?.split(' ')?.length || 0);
    
    console.log('=== FULL RESPONSE DATA ===');
    console.log('Raw response:', JSON.stringify(response.data, null, 2));
    console.log('=== ZOOM TOKEN DEBUG END ===');
    
    // Cache the token with 5 minute buffer before expiry
    zoomAccessTokenCache = {
      token: access_token,
      expiresAt: Date.now() + ((expires_in - 300) * 1000)
    };

    console.log('Successfully obtained Zoom access token with scope:', scope);
    return access_token;

  } catch (error) {
    console.error('=== ZOOM TOKEN ERROR DEBUG ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    
    if (error.response) {
      console.error('HTTP Response Error Details:');
      console.error('Status:', error.response.status);
      console.error('Status text:', error.response.statusText);
      console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      console.error('Response data type:', typeof error.response.data);
    } else if (error.request) {
      console.error('HTTP Request Error Details:');
      console.error('Request config:', JSON.stringify({
        url: error.config?.url,
        method: error.config?.method,
        headers: { ...error.config?.headers, Authorization: '[MASKED]' },
        data: error.config?.data,
        timeout: error.config?.timeout
      }, null, 2));
      console.error('No response received');
    } else {
      console.error('Configuration or other error');
    }
    
    console.error('=== END ZOOM TOKEN ERROR DEBUG ===');
    console.error('Error getting Zoom access token:', error.response?.data || error.message);
    throw new Error(`Failed to get Zoom access token: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Get recording files for a meeting from Zoom API
 */
async function getZoomRecordings(meetingUuid) {
  try {
    const accessToken = await getZoomAccessToken();
    
    console.log(`Fetching recordings for meeting ${meetingUuid}...`);
    
    // URL encode the meeting UUID (required for Zoom API)
    const encodedUuid = encodeURIComponent(meetingUuid);
    
    const response = await axios.get(`https://api.zoom.us/v2/meetings/${encodedUuid}/recordings`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;

  } catch (error) {
    console.error('Error fetching Zoom recordings:', error.response?.data || error.message);
    throw new Error(`Failed to fetch recordings: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Download audio file from Zoom for Whisper transcription
 */
async function downloadZoomAudio(downloadUrl) {
  try {
    const accessToken = await getZoomAccessToken();
    
    console.log('Downloading audio file from Zoom...');
    
    const response = await axios.get(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      responseType: 'arraybuffer' // Important for binary audio data
    });

    console.log(`Successfully downloaded audio file (${response.data.byteLength} bytes)`);
    return response.data;

  } catch (error) {
    console.error('Error downloading audio:', error.response?.data || error.message);
    throw new Error(`Failed to download audio: ${error.message}`);
  }
}

/**
 * Transcribe audio using OpenAI Whisper API with speaker hints
 */
async function transcribeWithWhisper(audioBuffer, participantList = []) {
  try {
    console.log('Transcribing audio with OpenAI Whisper...');
    
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      throw new Error('OpenAI API key not configured');
    }

    // Check file size (Whisper has 25MB limit)
    const maxSize = 25 * 1024 * 1024; // 25MB in bytes
    if (audioBuffer.byteLength > maxSize) {
      console.warn(`Audio file is ${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)}MB, exceeding Whisper's 25MB limit`);
      // TODO: Implement audio chunking for large files
      throw new Error('Audio file too large for Whisper API (>25MB). Audio chunking not yet implemented.');
    }

    // Create form data for Whisper API
    const FormData = require('form-data');
    const form = new FormData();
    
    // Add audio file
    form.append('file', audioBuffer, {
      filename: 'meeting_audio.m4a',
      contentType: 'audio/m4a'
    });
    
    // Configure Whisper for best results
    form.append('model', 'whisper-1');
    form.append('language', 'en'); // Can be made configurable
    form.append('response_format', 'verbose_json'); // Get timestamps and confidence
    
    // Add speaker hints if we have participant names
    if (participantList.length > 0) {
      const speakerHints = participantList.map(p => p.name).join(', ');
      form.append('prompt', `This is a business meeting with participants: ${speakerHints}. Please identify speakers clearly.`);
    }

    console.log(`Sending ${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)}MB audio to Whisper API...`);
    
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...form.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const transcriptionData = response.data;
    
    // Format the response for our use case
    let formattedTranscript = '';
    
    if (transcriptionData.segments) {
      // Use detailed segments with timestamps
      formattedTranscript = transcriptionData.segments.map(segment => {
        const timestamp = formatTimestamp(segment.start);
        const text = segment.text.trim();
        return `[${timestamp}] ${text}`;
      }).join('\n');
    } else {
      // Fallback to simple text
      formattedTranscript = transcriptionData.text || '';
    }

    console.log(`Whisper transcription completed: ${formattedTranscript.length} characters`);
    return formattedTranscript;

  } catch (error) {
    console.error('Error with Whisper transcription:', error.response?.data || error.message);
    throw new Error(`Whisper transcription failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Format seconds to MM:SS timestamp
 */
function formatTimestamp(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Parse VTT (WebVTT) format transcript to plain text
 */
function parseVTTToText(vttContent) {
  if (typeof vttContent !== 'string') {
    console.log('VTT content is not a string, converting...');
    vttContent = String(vttContent);
  }

  const lines = vttContent.split('\n');
  const textLines = [];
  let currentSpeaker = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip VTT headers, timing lines, and empty lines
    if (line === '' || line.startsWith('WEBVTT') || line.includes('-->') || /^\d+$/.test(line)) {
      continue;
    }
    
    // Extract speaker name if present (format: "Speaker Name:")
    if (line.includes(':') && !line.includes('-->')) {
      const colonIndex = line.indexOf(':');
      const potentialSpeaker = line.substring(0, colonIndex).trim();
      const potentialText = line.substring(colonIndex + 1).trim();
      
      // If the text after colon looks like spoken content, treat as speaker
      if (potentialText.length > 0 && potentialSpeaker.length < 50) {
        currentSpeaker = potentialSpeaker;
        if (potentialText) {
          textLines.push(`${currentSpeaker}: ${potentialText}`);
        }
      } else {
        textLines.push(line);
      }
    } else {
      // Regular transcript line
      if (currentSpeaker) {
        textLines.push(`${currentSpeaker}: ${line}`);
      } else {
        textLines.push(line);
      }
    }
  }
  
  return textLines.join('\n');
}

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
 * Handle transcript completion - download transcript and generate feedback
 */
async function handleTranscriptCompleted(payload) {
  try {
    console.log('=== TRANSCRIPT PROCESSING DEBUG START ===');
    console.log('Payload keys:', Object.keys(payload));
    console.log('Object keys:', Object.keys(payload.object || {}));
    console.log('Meeting UUID:', payload.object?.uuid);
    console.log('Meeting ID:', payload.object?.id);
    console.log('Account ID:', payload.object?.account_id);
    console.log('Recording files count:', payload.object?.recording_files?.length || 0);
    console.log('Has recording_play_passcode:', !!payload.object?.recording_play_passcode);
    console.log('Passcode length:', payload.object?.recording_play_passcode?.length || 0);
    console.log('=== TRANSCRIPT PROCESSING DEBUG END ===');
    
    console.log('Transcript is ready. Starting download process...');
    
    // 1. Find the VTT transcript file in the payload
    const recordingFiles = payload.object.recording_files;
    const transcriptFile = recordingFiles.find(file => file.file_type === 'TRANSCRIPT');

    if (!transcriptFile) {
      console.log('Error: Transcript (VTT) file not found in webhook payload.');
      return;
    }
    
    const downloadUrl = transcriptFile.download_url;
    console.log('Found transcript download URL.');

    // 3. Download the transcript file (with token AND passcode)
    console.log('Downloading transcript file with token and passcode...');
    
    // Get the passcode and the original download URL
    const passcode = payload.object.recording_play_passcode;
    let finalDownloadUrl = transcriptFile.download_url; // Start with the base URL
    
    // Robustly append the passcode
    const passcodeSeparator = finalDownloadUrl.includes('?') ? '&' : '?';
    finalDownloadUrl = `${finalDownloadUrl}${passcodeSeparator}pwd=${passcode}`;
    
    // Get the access token (force fresh token)
    console.log('=== GETTING ACCESS TOKEN ===');
    const accessToken = await getZoomAccessToken(true);
    console.log('Received access token length:', accessToken?.length || 0);
    console.log('Access token first 20 chars:', accessToken?.substring(0, 20) + '...');
    
    // Robustly append the access token
    const tokenSeparator = finalDownloadUrl.includes('?') ? '&' : '?';
    finalDownloadUrl = `${finalDownloadUrl}${tokenSeparator}access_token=${accessToken}`;
    
    console.log('=== DOWNLOAD URL CONSTRUCTION ===');
    console.log('Original download URL:', transcriptFile.download_url.substring(0, 100) + '...');
    console.log('Passcode separator:', passcodeSeparator);
    console.log('Token separator:', tokenSeparator);
    console.log('Final URL length:', finalDownloadUrl.length);
    console.log('Final URL (masked):', finalDownloadUrl.replace(/pwd=[^&]*/, 'pwd=***').replace(/access_token=[^&]*/, 'access_token=***'));
    
    // Make the request to the final, fully-formed URL
    console.log('=== MAKING DOWNLOAD REQUEST ===');
    console.log('Request URL length:', finalDownloadUrl.length);
    console.log('Request timestamp:', new Date().toISOString());
    
    const response = await axios.get(finalDownloadUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Node.js Zoom Webhook Server',
        'Accept': 'text/vtt, text/plain, */*'
      },
      validateStatus: function (status) {
        console.log('Download response status:', status);
        return status >= 200 && status < 400;
      }
    });
    
    const transcriptText = response.data;
    console.log('=== DOWNLOAD RESPONSE ANALYSIS ===');
    console.log('Response status:', response.status);
    console.log('Response headers keys:', Object.keys(response.headers || {}));
    console.log('Response content-type:', response.headers?.['content-type']);
    console.log('Response data type:', typeof transcriptText);
    console.log('Response data length:', transcriptText?.length || 0);
    console.log('Response is string:', typeof transcriptText === 'string');
    console.log('Response starts with WEBVTT:', transcriptText?.startsWith?.('WEBVTT') || false);
    console.log('Response starts with HTML:', transcriptText?.startsWith?.('<!') || false);
    console.log('Response contains "passcode":', transcriptText?.includes?.('passcode') || false);
    console.log('First 200 chars:', transcriptText?.substring(0, 200));
    console.log('Last 200 chars:', transcriptText?.substring(-200));
    console.log('=== END DOWNLOAD RESPONSE ANALYSIS ===');
    
    console.log('Transcript downloaded successfully!');
    console.log('--- Transcript Text ---');
    console.log(transcriptText.substring(0, 200) + '...');

    // 4. Get participants from payload
    const participants = payload.object.participants || [];
    console.log(`Processing feedback for ${participants.length} participants`);

    // 5. Generate feedback using OpenAI
    const feedback = await generateFeedback(transcriptText, participants);
    
    // 6. Send feedback to participants
    await sendFeedbackToParticipants(feedback, participants);

  } catch (error) {
    console.error('=== TRANSCRIPT PROCESSING ERROR DEBUG ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack first 500 chars:', error.stack?.substring(0, 500));
    
    if (error.response) {
      console.error('HTTP Response Error Details:');
      console.error('Status:', error.response.status);
      console.error('Status text:', error.response.statusText);
      console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Data type:', typeof error.response.data);
      console.error('Data length:', error.response.data?.length || 0);
      console.error('Data preview:', JSON.stringify(error.response.data)?.substring(0, 500));
    }
    console.error('=== END TRANSCRIPT PROCESSING ERROR DEBUG ===');
    
    console.error('Error processing transcript:', error.message);
    console.error('Error status:', error.response?.status);
    console.error('Error data:', error.response?.data);
    console.error('Error headers:', error.response?.headers);
  }
}

/**
 * Download and transcribe audio from Zoom (using Whisper API)
 */
async function downloadAndTranscribeAudio(audioUrl, participantList = []) {
  if (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET) {
    console.log('Zoom API credentials not configured, using mock transcript');
    return `Mock transcript content for testing purposes.
    
[00:00] Speaker 1: Good morning everyone, thanks for joining today's meeting.
[00:15] Speaker 2: Hi there, glad to be here. I've prepared the items we discussed.
[00:30] Speaker 1: Great, let's go through them one by one.
[00:45] Speaker 2: The first item is about improving our communication processes.
[01:00] Speaker 1: That's exactly what we need to focus on.
[01:15] Speaker 2: I agree, there are some gaps we need to address.`;
  }

  if (audioUrl === 'mock://audio') {
    console.log('Using mock audio URL, returning mock transcript');
    return await downloadAndTranscribeAudio(null, participantList);
  }

  try {
    // Download audio file from Zoom
    console.log('Starting audio download and transcription process...');
    const audioBuffer = await downloadZoomAudio(audioUrl);
    
    // Transcribe with Whisper
    const transcript = await transcribeWithWhisper(audioBuffer, participantList);
    
    return transcript;
  } catch (error) {
    console.error('Failed to download and transcribe audio, using fallback:', error.message);
    
    // Fallback to mock transcript if anything fails
    return `Failed to transcribe audio: ${error.message}

[00:00] System: Audio transcription failed, using fallback content.
[00:15] Speaker 1: This is a placeholder transcript due to transcription failure.
[00:30] Speaker 2: Please check the logs for details about the transcription error.`;
  }
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
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
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
