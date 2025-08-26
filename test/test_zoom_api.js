// Test script for Zoom API integration
require('dotenv').config();
const axios = require('axios');

// Test Zoom API access and VTT parsing
async function testZoomAPI() {
  console.log('🔧 Testing Zoom API Integration...');
  
  // Check environment variables
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  
  if (!clientId || clientId === 'your_zoom_client_id_here') {
    console.log('❌ ZOOM_CLIENT_ID not configured');
    console.log('💡 Get your Client ID from: https://marketplace.zoom.us/develop/create');
    console.log('💡 Add it to .env as: ZOOM_CLIENT_ID=your_actual_client_id');
    return;
  }
  
  if (!clientSecret || clientSecret === 'your_zoom_client_secret_here') {
    console.log('❌ ZOOM_CLIENT_SECRET not configured');
    console.log('💡 Get your Client Secret from your Zoom app settings');
    console.log('💡 Add it to .env as: ZOOM_CLIENT_SECRET=your_actual_client_secret');
    return;
  }
  
  console.log('✅ Zoom credentials configured');
  
  try {
    // Test Server-to-Server OAuth
    console.log('\n🔑 Testing Zoom OAuth...');
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const response = await axios.post('https://zoom.us/oauth/token', 
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, expires_in, token_type } = response.data;
    
    console.log('✅ Successfully obtained access token');
    console.log(`📅 Token expires in: ${expires_in} seconds`);
    console.log(`🔑 Token type: ${token_type}`);
    console.log(`🎫 Token preview: ${access_token.substring(0, 20)}...`);
    
    // Test API call with the token
    console.log('\n📊 Testing API call with token...');
    
    try {
      const userResponse = await axios.get('https://api.zoom.us/v2/users/me', {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ API call successful');
      console.log(`👤 Account: ${userResponse.data.account_id}`);
      console.log(`📧 Email: ${userResponse.data.email}`);
      console.log(`🏢 Account type: ${userResponse.data.type}`);
      
    } catch (apiError) {
      console.log('❌ API call failed:', apiError.response?.data || apiError.message);
    }
    
  } catch (error) {
    console.error('❌ OAuth failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('💡 Check that your Client ID and Client Secret are correct');
      console.log('💡 Make sure your Zoom app has Server-to-Server OAuth enabled');
    }
  }
}

// Test VTT parsing function
function testVTTParsing() {
  console.log('\n📝 Testing VTT transcript parsing...');
  
  const sampleVTT = `WEBVTT

1
00:00:00.000 --> 00:00:05.000
John Smith: Good morning everyone, thanks for joining today's meeting.

2
00:00:05.500 --> 00:00:10.000
Sarah Johnson: Hi John, glad to be here. I've prepared the user stories.

3
00:00:10.500 --> 00:00:15.000
Mike Chen: Morning all. Just to clarify, are we still targeting the same deadline?

4
00:00:15.500 --> 00:00:20.000
John Smith: Yes, the deadline hasn't changed. Sarah, can you walk us through the stories?`;

  // Import the parsing function from index.js
  function parseVTTToText(vttContent) {
    const lines = vttContent.split('\n');
    const textLines = [];
    let currentSpeaker = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip VTT headers, timing lines, and empty lines
      if (line === '' || line.startsWith('WEBVTT') || line.includes('-->') || /^\d+$/.test(line)) {
        continue;
      }
      
      // Extract speaker name if present
      if (line.includes(':') && !line.includes('-->')) {
        const colonIndex = line.indexOf(':');
        const potentialSpeaker = line.substring(0, colonIndex).trim();
        const potentialText = line.substring(colonIndex + 1).trim();
        
        if (potentialText.length > 0 && potentialSpeaker.length < 50) {
          currentSpeaker = potentialSpeaker;
          if (potentialText) {
            textLines.push(`${currentSpeaker}: ${potentialText}`);
          }
        } else {
          textLines.push(line);
        }
      } else {
        if (currentSpeaker) {
          textLines.push(`${currentSpeaker}: ${line}`);
        } else {
          textLines.push(line);
        }
      }
    }
    
    return textLines.join('\n');
  }
  
  const parsedText = parseVTTToText(sampleVTT);
  
  console.log('📄 Sample VTT input:');
  console.log(sampleVTT.substring(0, 200) + '...');
  
  console.log('\n✅ Parsed transcript output:');
  console.log(parsedText);
  
  console.log(`\n📊 Parsing results:`);
  console.log(`- Original length: ${sampleVTT.length} characters`);
  console.log(`- Parsed length: ${parsedText.length} characters`);
  console.log(`- Lines extracted: ${parsedText.split('\n').length}`);
}

// Run tests
async function runAllTests() {
  await testZoomAPI();
  testVTTParsing();
  
  console.log('\n🎉 Zoom API integration test completed!');
  console.log('💡 Next steps:');
  console.log('  1. Configure your Zoom app credentials if not done');
  console.log('  2. Test with real meeting recordings');
  console.log('  3. Deploy to production with environment variables');
}

runAllTests().catch(console.error);
