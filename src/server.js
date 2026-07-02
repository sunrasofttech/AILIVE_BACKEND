const app = require('./app');
const http = require('http');
const { fork } = require('child_process');
const path = require('path');
const { sequelize } = require('./models');
const { startWebSocketServer } = require('./websocket/wsServer');
const defaults = require('./config/defaults');

const port = defaults.port;

// ── LiveKit Agent Worker (auto-managed child process) ────────────────
const AGENT_WORKER_PATH = path.resolve(__dirname, 'workers/livekitAgentWorker.js');
let agentWorkerProcess = null;
let agentRestartCount = 0;

function spawnAgentWorker() {
  console.log(`[AgentManager] Spawning LiveKit Agent Worker (attempt #${agentRestartCount + 1})...`);

  agentWorkerProcess = fork(AGENT_WORKER_PATH, ['dev'], {
    env: {
      ...process.env,
      // Ensure LiveKit connection details are passed to the child
      LIVEKIT_URL: process.env.LIVEKIT_URL || defaults.livekit.url,
      LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || defaults.livekit.apiKey,
      LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || defaults.livekit.apiSecret,
    },
    stdio: 'inherit', // Pipe child stdout/stderr to parent so PM2 captures it
  });

  agentWorkerProcess.on('exit', (code, signal) => {
    agentRestartCount++;
    const delay = Math.min(agentRestartCount * 3000, 30000); // 3s, 6s, 9s... max 30s
    console.error(`[AgentManager] Agent Worker exited (code=${code}, signal=${signal}). Restarting in ${delay / 1000}s...`);
    agentWorkerProcess = null;
    setTimeout(spawnAgentWorker, delay);
  });

  agentWorkerProcess.on('error', (err) => {
    console.error(`[AgentManager] Agent Worker process error:`, err.message);
  });
}

// ── Main Server Boot ─────────────────────────────────────────────────
async function bootServer() {
  try {
    console.log('Testing MySQL Database connection...');
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // Sync models and seed data in development mode only
    if (defaults.nodeEnv !== 'production') {
      console.log('Syncing database models...');
      // Note: sync() creates tables if they do not exist
      await sequelize.sync();
      console.log('All database models synced successfully.');

      const { seedVoices } = require('./utils/seeder');
      await seedVoices();
    }

    // Start queue workers in all environments
    console.log('Starting background queue workers (Scheduler, Call, and AI Worker)...');
    const { startScheduler } = require('./workers/schedulerWorker');
    const { startCallWorker } = require('./workers/callWorker');
    const { startAiWorker } = require('./workers/aiWorker');

    startScheduler();
    startCallWorker();
    startAiWorker();

    // Start the LiveKit Agent Worker as a managed child process
    spawnAgentWorker();

    const server = http.createServer(app);

    // Attach WebSocket server sharing the same port / server
    startWebSocketServer(server);

    server.listen(port, () => {
      console.log(`===============================================`);
      console.log(`  AI Calling SaaS API Server running on port ${port}`);
      console.log(`  Swagger docs: http://localhost:${port}/api-docs`);
      console.log(`  WebSocket endpoint: ws://localhost:${port}/ws/vobiz`);
      console.log(`  LiveKit Agent Worker: auto-managed child process`);
      console.log(`===============================================`);
    });

  } catch (error) {
    console.error('Server boot crash:', error);
    process.exit(1);
  }
}

// Graceful shutdown: kill the agent worker when the main server exits
process.on('SIGINT', () => {
  if (agentWorkerProcess) agentWorkerProcess.kill();
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (agentWorkerProcess) agentWorkerProcess.kill();
  process.exit(0);
});

bootServer();

