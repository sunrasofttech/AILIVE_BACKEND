try {
  const { cli, voice } = require('@livekit/agents');
  console.log('Success! Imported @livekit/agents. cli:', typeof cli, 'voice:', typeof voice);
} catch (e) {
  console.error('Failed to import @livekit/agents:', e.message);
}
