const { ServerOptions } = require('@livekit/agents');
const opts = new ServerOptions({ agent: './dummy.js' });
console.log('ServerOptions keys:', Object.keys(opts));
console.log('ServerOptions JSON:', JSON.stringify(opts, null, 2));
process.exit(0);
