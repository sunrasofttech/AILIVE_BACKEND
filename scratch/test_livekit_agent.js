const { AgentServer, ServerOptions } = require('@livekit/agents');
const path = require('path');
const defaults = require('../config/defaults');

// Force environment variables for local self-hosted LiveKit
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL || defaults.livekit.url;
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || defaults.livekit.apiKey;
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || defaults.livekit.apiSecret;

const voiceAgentPath = path.resolve(__dirname, '../src/agent/voiceAgent.js');

async function testAgentSetup() {
  console.log('--- Testing LiveKit Agent Setup ---');
  console.log(`URL: ${process.env.LIVEKIT_URL}`);
  console.log(`API Key: ${process.env.LIVEKIT_API_KEY}`);
  console.log(`Agent Script: ${voiceAgentPath}`);

  try {
    const opts = new ServerOptions({
      agent: voiceAgentPath,
      wsURL: process.env.LIVEKIT_URL,
      apiKey: process.env.LIVEKIT_API_KEY,
      apiSecret: process.env.LIVEKIT_API_SECRET,
    });

    const server = new AgentServer(opts);
    
    console.log('Connecting agent worker to local LiveKit server...');
    await server.run();
    console.log('Worker is now running and waiting for jobs.');

    console.log('Triggering simulated job in room: sip_call_test_room_uuid');
    await server.simulateJob('sip_call_test_room_uuid', 'sip:+919876543210');
    console.log('Simulation event dispatched successfully!');

    // Wait 5 seconds and exit
    setTimeout(() => {
      console.log('Test completed successfully. Stopping worker...');
      server.close();
      process.exit(0);
    }, 5000);

  } catch (err) {
    console.error('Test failed with error:', err.message);
    process.exit(1);
  }
}

testAgentSetup();
