const WebSocket = require('ws');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('No GEMINI_API_KEY found in .env');
  process.exit(1);
}

const MODEL_NAME = "gemini-3.1-flash-live-preview";
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

console.log(`Connecting...`);
const websocket = new WebSocket(WS_URL);

websocket.on('open', () => {
  console.log('WebSocket Connected');

  // Full setup message matching geminiMultimodalLiveService.js
  const setupMessage = {
    setup: {
      model: `models/${MODEL_NAME}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Puck',
            },
          },
        },
      },
      systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }],
      },
      realtimeInputConfig: {
        activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  };
  websocket.send(JSON.stringify(setupMessage));
  console.log('Full Setup sent.');
});

websocket.on('message', (data) => {
  console.log('Received:', data.toString());
});

websocket.on('error', (error) => {
  console.error('WebSocket Error:', error);
});

websocket.on('close', (code, reason) => {
  console.log(`WebSocket Closed. Code: ${code}, Reason: ${reason ? reason.toString() : 'None'}`);
});
