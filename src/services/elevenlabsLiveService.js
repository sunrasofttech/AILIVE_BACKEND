const WebSocket = require('ws');
const defaults = require('../config/defaults');

class ElevenLabsLiveSession {
  /**
   * Represents an active ElevenLabs Conversational AI session using their bidirectional WebSocket API.
   * 
   * @param {object} config
   * @param {string} config.systemPrompt - System instruction/prompt override
   * @param {string} config.agentId - ElevenLabs Agent ID (passed via voiceId or configured)
   * @param {string} [config.firstMessage] - Custom greeting message override
   * @param {function} config.onAudioOutput - Callback when audio chunk (PCM 16kHz) is received
   * @param {function} config.onTranscription - Callback when transcription is received
   * @param {function} config.onInterrupted - Callback when user interruption is detected
   * @param {function} config.onError - Callback on error
   * @param {function} config.onClose - Callback on close
   */
  constructor({ systemPrompt, agentId, firstMessage, onAudioOutput, onTranscription, onInterrupted, onError, onClose }) {
    this.systemPrompt = systemPrompt;
    this.agentId = agentId;
    this.firstMessage = firstMessage;
    this.onAudioOutput = onAudioOutput;
    this.onTranscription = onTranscription;
    this.onInterrupted = onInterrupted;
    this.onError = onError;
    this.onClose = onClose;

    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.ws = null;
    this.isConnected = false;
    this.isSetupComplete = false;
  }

  /**
   * Connect to ElevenLabs Conversational AI WebSocket
   */
  connect(hasPreRecordedFirstMessage = false, firstMessageOverride = null) {
    if (!this.agentId) {
      const err = new Error('ElevenLabs Agent ID is required. Please set the Voice ID of the agent to your ElevenLabs Agent ID.');
      console.error('[ElevenLabs Live]', err.message);
      if (this.onError) this.onError(err);
      return;
    }

    const greeting = firstMessageOverride || this.firstMessage;

    try {
      // ElevenLabs Conversational AI WSS URL
      let url = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${this.agentId}`;
      
      // If we don't have an API key, we connect anonymously (requires the agent to be public on ElevenLabs)
      const headers = {};
      if (this.apiKey) {
        headers['xi-api-key'] = this.apiKey;
        console.log(`[ElevenLabs Live] Connecting with API Key to Agent: ${this.agentId}`);
      } else {
        console.log(`[ElevenLabs Live] Connecting anonymously to Agent: ${this.agentId}`);
      }

      this.ws = new WebSocket(url, { headers });

      this.ws.on('open', () => {
        console.log('[ElevenLabs Live] WebSocket connection established.');
        this.isConnected = true;
        this.isSetupComplete = true;

        // Send initial conversation initiation chunk to override prompt and greeting if necessary
        const initConfig = {
          type: 'conversation_initiation_client_data',
          conversation_initiation_client_data: {
            conversation_config_override: {
              agent: {
                prompt: {
                  prompt: this.systemPrompt,
                },
                first_message: hasPreRecordedFirstMessage ? "" : (greeting || ""),
              }
            }
          }
        };

        this.ws.send(JSON.stringify(initConfig));
      });

      this.ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());

          // Handle Audio Output from Agent
          if (parsed.type === 'audio' && parsed.audio?.audio) {
            const pcmBuffer = Buffer.from(parsed.audio.audio, 'base64');
            if (this.onAudioOutput) {
              // ElevenLabs Conversational AI outputs 16kHz 16-bit mono PCM
              this.onAudioOutput(pcmBuffer, 16000);
            }
          }

          // Handle Agent Text Transcript
          if (parsed.type === 'agent_response' && parsed.agent_response?.text) {
            if (this.onTranscription) {
              this.onTranscription(parsed.agent_response.text, 'agent');
            }
          }

          // Handle User Text Transcript
          if (parsed.type === 'user_transcript' && parsed.user_transcript?.text) {
            if (this.onTranscription) {
              this.onTranscription(parsed.user_transcript.text, 'user');
            }
          }

          // Handle User Interruption (Barge-in)
          if (parsed.type === 'interruption') {
            console.log('[ElevenLabs Live] Agent was interrupted by user speech.');
            if (this.onInterrupted) {
              this.onInterrupted();
            }
          }

          // Handle Ping/Pong
          if (parsed.type === 'ping' && parsed.ping?.ping_id) {
            this.ws.send(JSON.stringify({
              type: 'pong',
              pong: {
                ping_id: parsed.ping.ping_id
              }
            }));
          }

        } catch (err) {
          // Ignore JSON parsing errors for binary frames or invalid formats
        }
      });

      this.ws.on('error', (err) => {
        console.error('[ElevenLabs Live] WebSocket Error:', err.message);
        if (this.onError) this.onError(err);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[ElevenLabs Live] Connection closed. Code: ${code}, Reason: ${reason}`);
        this.isConnected = false;
        this.isSetupComplete = false;
        if (this.onClose) this.onClose();
      });

    } catch (err) {
      console.error('[ElevenLabs Live] Connection setup failed:', err.message);
      if (this.onError) this.onError(err);
    }
  }

  /**
   * Send raw 16kHz PCM audio chunk from customer to ElevenLabs
   * @param {Buffer} pcmBuffer 
   */
  sendAudioChunk(pcmBuffer) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const base64Audio = pcmBuffer.toString('base64');
    const payload = {
      user_audio_chunk: base64Audio
    };

    this.ws.send(JSON.stringify(payload));
  }

  /**
   * Send text input (not commonly used in live voice, but implemented for compatibility)
   */
  sendText(text) {
    // ElevenLabs conversational WSS doesn't have a direct text-input event in the same way,
    // but we can log it or ignore.
    console.log(`[ElevenLabs Live] sendText called (ignored by WSS): "${text}"`);
  }

  /**
   * Terminate the session
   */
  close() {
    this.isConnected = false;
    this.isSetupComplete = false;
    if (this.ws) {
      try {
        this.ws.removeAllListeners('error');
        this.ws.on('error', () => {});
        this.ws.close();
      } catch (err) {
        // ignore
      }
      this.ws = null;
    }
  }
}

module.exports = ElevenLabsLiveSession;
