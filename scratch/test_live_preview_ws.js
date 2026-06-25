const WebSocket = require('ws');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('No GEMINI_API_KEY found in .env');
  process.exit(1);
}

const MODEL_NAME = "gemini-3.1-flash-live-preview";
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

console.log(`Connecting to: wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=***`);
const websocket = new WebSocket(WS_URL);

websocket.on('open', () => {
  console.log('WebSocket Connected');

  // Send the initial configuration
  const setupMessage = {
    setup: {
      model: `models/${MODEL_NAME}`,
      generationConfig: {
        responseModalities: ['AUDIO']
      },
      systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }]
      }
    }
  };
  websocket.send(JSON.stringify(setupMessage));
  console.log('Configuration sent:', JSON.stringify(setupMessage, null, 2));
});

websocket.on('message', (data) => {
  try {
    const response = JSON.parse(data.toString());
    console.log('Received JSON:', JSON.stringify(response, null, 2));
  } catch (err) {
    console.log('Received raw:', data.toString());
  }
});

websocket.on('error', (error) => {
  console.error('WebSocket Error:', error);
});

websocket.on('close', (code, reason) => {
  console.log(`WebSocket Closed. Code: ${code}, Reason: ${reason ? reason.toString() : 'None'}`);
});
