const { cli, ServerOptions } = require('@livekit/agents');
const path = require('path');
const defaults = require('../config/defaults');

// LiveKit Agents CLI expects the path to the voice agent file
const voiceAgentPath = path.resolve(__dirname, '../agent/voiceAgent.js');

function startLivekitWorker() {
  // Ensure connection parameters are populated in process.env for the CLI runner
  process.env.LIVEKIT_URL = process.env.LIVEKIT_URL || defaults.livekit.url;
  process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || defaults.livekit.apiKey;
  process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || defaults.livekit.apiSecret;

  console.log(`Starting LiveKit Agent Worker pointing to LiveKit server: ${process.env.LIVEKIT_URL}`);

  // Default to 'dev' option if no CLI args are passed.
  // 'start' (production mode) hardcodes port 8081 which conflicts with PM2.
  // 'dev' mode picks a random open port for the health-check server.
  if (process.argv.length <= 2) {
    process.argv.push('dev');
  }

  const opts = new ServerOptions({
    agent: voiceAgentPath,
    initializeProcessTimeout: 60000, // 60 seconds (Node.js SDK uses milliseconds, not seconds!)
    port: 0, // Pick a random open port for the health check server to avoid EADDRINUSE
  });

  cli.runApp(opts);
}

if (require.main === module) {
  startLivekitWorker();
}

module.exports = {
  startLivekitWorker,
};
