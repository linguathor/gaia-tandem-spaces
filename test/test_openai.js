// Test script for OpenAI feedback generation
require('dotenv').config();
const OpenAI = require('openai');

// Mock data for testing
const mockTranscript = `
[00:00] John Smith: Good morning everyone, thanks for joining today's sprint planning meeting.

[00:15] Sarah Johnson: Hi John, glad to be here. I've prepared the user stories we discussed last week.

[00:30] Mike Chen: Morning all. Just to clarify, are we still targeting the same deadline we discussed before?

[00:45] John Smith: Yes, the deadline hasn't changed. Sarah, can you walk us through the stories?

[01:00] Sarah Johnson: Sure. So we have three main features to implement. The first one is the user authentication system...

[01:30] Mike Chen: Sorry to interrupt, but I'm concerned about the timeline. Last sprint we struggled with similar complexity.

[01:45] John Smith: That's a fair point Mike. What do you think would be more realistic?

[02:00] Sarah Johnson: Well, maybe we should prioritize the most critical features first?

[02:15] Mike Chen: Exactly. I think we're being overly optimistic again.

[02:30] John Smith: Alright, let's break this down feature by feature and estimate more carefully.

[02:45] Sarah Johnson: Sounds good. For the authentication system, I estimate about 5 days.

[03:00] Mike Chen: Hmm, that seems tight given the security requirements we need to implement.

[03:15] John Smith: Mike, what would your estimate be?

[03:30] Mike Chen: I'd say 7-8 days to be safe, including proper testing.

[03:45] Sarah Johnson: Okay, I can see that. Better to be conservative.

[04:00] John Smith: Great, let's document that and move to the next feature.
`;

const mockParticipants = [
  { id: '1', name: 'John Smith', email: 'john.smith@company.com', joinTime: '2024-01-15T10:00:00Z' },
  { id: '2', name: 'Sarah Johnson', email: 'sarah.johnson@company.com', joinTime: '2024-01-15T10:00:00Z' },
  { id: '3', name: 'Mike Chen', email: 'mike.chen@company.com', joinTime: '2024-01-15T10:00:00Z' }
];

async function testOpenAIFeedback() {
  console.log('Testing OpenAI feedback generation...');
  
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    console.log('❌ OPENAI_API_KEY not configured. Please set your OpenAI API key in .env');
    console.log('Example: OPENAI_API_KEY=sk-...');
    return;
  }
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  
  try {
    const participantNames = mockParticipants.map(p => p.name).join(', ');
    
    const systemPrompt = `You are an expert meeting analyst specializing in "Spaces" - the gaps between what people say and what they really mean in professional meetings. 

Analyze the meeting transcript and provide insights in JSON format with these fields:
- summary: Brief overview of meeting effectiveness
- communicationInsights: Array of communication pattern observations
- hiddenDynamics: Array of unspoken elements identified
- collaborationScore: Number 1-10 rating team collaboration
- actionItems: Array of specific recommendations
- individualFeedback: Object with participant feedback

Keep insights constructive and actionable.`;

    const userPrompt = `Analyze this sprint planning meeting with participants: ${participantNames}

Transcript:
${mockTranscript}`;

    console.log('Calling OpenAI API...');
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const content = response.choices[0].message.content;
    console.log('✅ OpenAI Response received');
    console.log('Raw response:');
    console.log(content);
    
    try {
      const feedback = JSON.parse(content);
      console.log('\n✅ Successfully parsed as JSON');
      console.log('\nStructured Feedback:');
      console.log('Summary:', feedback.summary);
      console.log('Collaboration Score:', feedback.collaborationScore);
      console.log('Communication Insights:', feedback.communicationInsights?.length || 0, 'items');
      console.log('Action Items:', feedback.actionItems?.length || 0, 'items');
    } catch (parseError) {
      console.log('\n❌ Failed to parse response as JSON');
      console.log('Parse Error:', parseError.message);
    }
    
  } catch (error) {
    console.error('❌ Error calling OpenAI API:', error.message);
    if (error.message.includes('API key')) {
      console.log('💡 Make sure your OpenAI API key is correct and has billing configured');
    }
  }
}

// Run the test
testOpenAIFeedback().catch(console.error);
