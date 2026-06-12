const { createClient } = require('redis');
require('dotenv').config();

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = process.env.REDIS_PORT || 6379;
const redisPassword = process.env.REDIS_PASSWORD || null;

const redisUrl = redisPassword
  ? `redis://:${redisPassword}@${redisHost}:${redisPort}`
  : `redis://${redisHost}:${redisPort}`;

const client = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 20) {
        console.error('Redis reconnection maximum retries exceeded. Exiting.');
        return new Error('Redis connection lost');
      }
      return Math.min(retries * 100, 3000); // Backoff: 100ms, 200ms, ... up to 3s
    },
  },
});

client.on('error', (err) => console.error('Redis Client Error:', err));
client.on('connect', () => console.log('Redis Client Connected'));

// Connect the client immediately
(async () => {
  try {
    await client.connect();
  } catch (error) {
    console.error('Failed to connect to Redis during startup:', error);
  }
})();

// Helper to duplicate redis connection (required for blocking commands or pub/sub)
const duplicateClient = async () => {
  const dup = client.duplicate();
  await dup.connect();
  return dup;
};

module.exports = {
  redisClient: client,
  duplicateClient,
};
