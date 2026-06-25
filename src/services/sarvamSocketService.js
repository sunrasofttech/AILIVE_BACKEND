const WebSocket = require('ws');
const defaults = require('../config/defaults');

function addWavHeader(pcmBuffer, sampleRate = 16000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // 1 Channel (Mono)
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * 16 * 1) / 8, 28);
  header.writeUInt16LE((16 * 1) / 8, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

class SarvamSTTStream {
  /**
   * Persistent Speech-to-Text WebSocket Stream
   * @param {object} params
   * @param {string} params.languageCode - Language code (e.g. en-IN)
   * @param {function} params.onTranscript - Callback when new transcript is received
   * @param {function} params.onError - Callback on WebSocket error
   */
  constructor({ languageCode = defaults.sarvam.defaultLanguageCode, onTranscript, onError }) {
    this.apiKey = defaults.sarvam.apiKey;
    this.apiBaseUrl = defaults.sarvam.apiBaseUrl || 'https://api.sarvam.ai';
    this.languageCode = languageCode || 'en-IN';
    this.onTranscript = onTranscript;
    this.onError = onError;

    this.ws = null;
    this.isMock = !this.apiKey || this.apiKey === 'your_sarvam_api_key';
    this.isConnected = false;

    // Local buffering for mock mode
    this.mockTimer = null;
    this.mockResponses = [
      'hello',
      'i am interested in your services',
      'can you call me back tomorrow at noon?',
      'yes that works for me',
      'thank you goodbye',
    ];
  }

  connect() {
    if (this.isMock) {
      console.warn('[Mock Sarvam STT WSS] Key missing. Initializing Mock STT stream.');
      this.isConnected = true;
      return;
    }

    try {
      const wsBaseUrl = this.apiBaseUrl.replace(/^http/, 'ws');
      const url = `${wsBaseUrl}/speech-to-text/ws?language-code=${this.languageCode}`;

      console.log(`[Sarvam STT WSS] Connecting to: ${url}`);
      this.ws = new WebSocket(url, {
        headers: {
          'api-subscription-key': this.apiKey,
        },
      });

      this.ws.on('open', () => {
        console.log('[Sarvam STT WSS] Connection established.');
        this.isConnected = true;
      });

      this.ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'data' && parsed.data?.transcript) {
            if (this.onTranscript) {
              this.onTranscript(parsed.data.transcript);
            }
          }
        } catch (err) {
          // Ignore JSON parsing errors
        }
      });

      this.ws.on('error', (err) => {
        console.error('[Sarvam STT WSS] Error:', err.message);
        if (this.onError) this.onError(err);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[Sarvam STT WSS] Connection closed. Code: ${code}, Reason: ${reason}`);
        this.isConnected = false;
      });
    } catch (err) {
      console.error('[Sarvam STT WSS] Connection setup failed:', err.message);
      if (this.onError) this.onError(err);
    }
  }

  sendAudio(pcmBuffer) {
    if (!this.isConnected) return;

    if (this.isMock) {
      // Simulate silence detection and transcription in mock mode
      if (this.mockTimer) clearTimeout(this.mockTimer);
      this.mockTimer = setTimeout(() => {
        const transcript = this.mockResponses[Math.floor(Math.random() * this.mockResponses.length)];
        if (this.onTranscript) {
          this.onTranscript(transcript);
        }
      }, 800);
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const wavBuffer = addWavHeader(pcmBuffer, 16000);
      const payload = JSON.stringify({
        audio: {
          data: wavBuffer.toString('base64'),
          sample_rate: '16000',
          encoding: 'audio/wav',
        },
      });
      this.ws.send(payload);
    }
  }

  close() {
    this.isConnected = false;
    if (this.mockTimer) clearTimeout(this.mockTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (err) {
        // Ignore close errors
      }
      this.ws = null;
    }
  }
}

class SarvamTTSStream {
  /**
   * Persistent Text-to-Speech WebSocket Stream
   * @param {object} params
   * @param {string} params.languageCode - Language code (e.g. en-IN)
   * @param {string} params.voiceId - Speaker ID (e.g. shubh)
   * @param {function} params.onAudioChunk - Callback when synthesized audio chunk is received (decoded raw PCM)
   * @param {function} params.onDone - Callback when streaming is completed
   * @param {function} params.onError - Callback on error
   */
  constructor({ languageCode = defaults.sarvam.defaultLanguageCode, voiceId = defaults.sarvam.defaultVoiceId, onAudioChunk, onDone, onError }) {
    this.apiKey = defaults.sarvam.apiKey;
    this.apiBaseUrl = defaults.sarvam.apiBaseUrl || 'https://api.sarvam.ai';
    this.languageCode = languageCode || 'en-IN';
    this.voiceId = voiceId || 'amrit';
    this.onAudioChunk = onAudioChunk;
    this.onDone = onDone;
    this.onError = onError;

    this.ws = null;
    this.isMock = !this.apiKey || this.apiKey === 'your_sarvam_api_key';
    this.isConnected = false;
    this.queuedText = null;
  }

  connect() {
    if (this.isMock) {
      console.warn('[Mock Sarvam TTS WSS] Key missing. Initializing Mock TTS stream.');
      this.isConnected = true;
      return;
    }

    try {
      const wsBaseUrl = this.apiBaseUrl.replace(/^http/, 'ws');
      const url = `${wsBaseUrl}/text-to-speech/ws?model=bulbul:v3&send_completion_event=true`;

      console.log(`[Sarvam TTS WSS] Connecting to: ${url}`);
      this.ws = new WebSocket(url, {
        headers: {
          'api-subscription-key': this.apiKey,
        },
      });

      this.ws.on('open', () => {
        console.log('[Sarvam TTS WSS] Connection established.');
        this.isConnected = true;

        // Send initial handshake configuration
        const configMessage = JSON.stringify({
          type: 'config',
          data: {
            target_language_code: this.languageCode,
            speaker: this.voiceId,
          },
        });
        this.ws.send(configMessage);

        // Send queued text if any
        if (this.queuedText) {
          this._sendTextPayload(this.queuedText);
          this.queuedText = null;
        }
      });

      this.ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'audio' && parsed.data?.audio) {
            const base64Audio = parsed.data.audio;
            const audioBuffer = Buffer.from(base64Audio, 'base64');
            
            // Audio from Sarvam TTS WSS is typically encoded base64 WAV.
            // If it has a WAV header, strip it or parse PCM.
            // Since VoicePipeline synthesizes and resamples, let's extract the raw PCM chunk.
            if (this.onAudioChunk) {
              this.onAudioChunk(audioBuffer);
            }
          } else if (parsed.type === 'event' && (parsed.data?.event === 'final_audio_chunk_generated' || parsed.data?.event_type === 'final')) {
            if (this.onDone) this.onDone();
          }
        } catch (err) {
          // Ignore JSON parsing errors
        }
      });

      this.ws.on('error', (err) => {
        console.error('[Sarvam TTS WSS] Error:', err.message);
        if (this.onError) this.onError(err);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[Sarvam TTS WSS] Connection closed. Code: ${code}, Reason: ${reason}`);
        this.isConnected = false;
        if (this.onDone) this.onDone();
      });
    } catch (err) {
      console.error('[Sarvam TTS WSS] Connection setup failed:', err.message);
      if (this.onError) this.onError(err);
    }
  }

  sendText(text) {
    if (this.isMock) {
      // Simulate streaming chunks back
      setTimeout(() => {
        if (this.onAudioChunk) {
          // Send 1024 bytes of silent mock audio
          this.onAudioChunk(Buffer.alloc(1024));
        }
        setTimeout(() => {
          if (this.onDone) this.onDone();
        }, 300);
      }, 200);
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this._sendTextPayload(text);
    } else {
      this.queuedText = text;
    }
  }

  _sendTextPayload(text) {
    const textMessage = JSON.stringify({
      type: 'text',
      data: {
        text: text,
      },
    });
    this.ws.send(textMessage);

    // Immediately send flush to initiate synthesis for this sentence segment
    const flushMessage = JSON.stringify({
      type: 'flush',
    });
    this.ws.send(flushMessage);
  }

  close() {
    this.isConnected = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (err) {
        // Ignore close errors
      }
      this.ws = null;
    }
  }
}

module.exports = {
  SarvamSTTStream,
  SarvamTTSStream,
};
