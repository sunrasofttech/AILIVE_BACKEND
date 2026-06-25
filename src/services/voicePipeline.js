const { GeminiLiveSession } = require('./geminiLiveService');
const { GeminiMultimodalLiveSession } = require('./geminiMultimodalLiveService');
const { SarvamLiveSession } = require('./sarvamLiveService');
const { SarvamSTTStream, SarvamTTSStream, SARVAM_LOCALE_MAP } = require('./sarvamSocketService');
const defaults = require('../config/defaults');
const fs = require('fs');
const path = require('path');

/**
 * Downsample 16-bit mono PCM from inputRate to outputRate using linear interpolation.
 */
function resamplePCM(inputBuffer, inputRate, outputRate) {
  if (inputRate === outputRate) return inputBuffer;
  const inputSamples = Math.floor(inputBuffer.length / 2);
  const outputSamples = Math.floor(inputSamples * outputRate / inputRate);
  const outputBuffer = Buffer.alloc(outputSamples * 2);
  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i * inputRate / outputRate;
    const srcFloor = Math.floor(srcPos);
    const srcCeil = Math.min(srcFloor + 1, inputSamples - 1);
    const frac = srcPos - srcFloor;
    const s1 = inputBuffer.readInt16LE(srcFloor * 2);
    const s2 = inputBuffer.readInt16LE(srcCeil * 2);
    const sample = Math.round(s1 + frac * (s2 - s1));
    outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }
  return outputBuffer;
}

/**
 * Strip markdown formatting from Gemini text before TTS synthesis.
 */
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Preprocess text for natural-sounding TTS.
 */
function preprocessForTTS(text) {
  return text
    .replace(/\bMr\./g, 'Mister')
    .replace(/\bMrs\./g, 'Misses')
    .replace(/\bDr\./g, 'Doctor')
    .replace(/\bvs\./gi, 'versus')
    .replace(/\betc\./gi, 'etcetera')
    .replace(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi, (_, h, m, period) =>
      `${h}:${m} ${period}`)
    .replace(/([.!?])\s+/g, '$1  ')
    .replace(/\s{3,}/g, '  ')
    .trim();
}

/**
 * Compute actual audio duration in milliseconds from a WAV buffer.
 */
function wavDurationMs(wavBuffer) {
  if (wavBuffer.length < 44) return 1500;
  try {
    const sampleRate = wavBuffer.readUInt32LE(24);
    const byteRate = wavBuffer.readUInt32LE(28);
    if (!byteRate || byteRate <= 0) return 1500;
    const dataLength = wavBuffer.length - 44;
    const duration = Math.round((dataLength / byteRate) * 1000);
    return isFinite(duration) && duration > 0 ? duration : 1500;
  } catch {
    return 1500;
  }
}

/**
 * VoicePipeline orchestrates STT, LLM streaming, and TTS over WebSockets for custom/customv2.
 */
class VoicePipeline {
  constructor(options) {
    this.agent = options.agent;
    this.onAudioOutput = options.onAudioOutput;
    this.onClearAudio = options.onClearAudio;
    this.onAgentTranscription = options.onAgentTranscription;
    this.onCustomerTranscription = options.onCustomerTranscription;
    this.onError = options.onError;
    this.onLog = options.onLog;

    this.isAgentSpeaking = false;
    this.speakingTimeout = null;
    this._ttsQueue = Promise.resolve();
    this._ttsGeneration = 0;
    this._activeTtsGeneration = null;

    this.accumulatedTranscript = '';
    this.transcriptionSilenceTimer = null;
    this.SILENCE_TIMEOUT_MS = 500;

    this.sarvamSttStream = null;
    this.sarvamTtsStream = null;
    this.detectedLanguageCode = null;

    this.isConnected = true;
    this.activeProvider = ['geminilive', 'custom', 'customv2'].includes(this.agent.aiProvider)
      ? this.agent.aiProvider
      : 'custom';
    this._isSwitchingProvider = false;

    this._log('info', `Initializing VoicePipeline with AI Provider: ${this.agent.aiProvider}`);

    if (this.activeProvider === 'geminilive') {
      this.geminiSession = new GeminiMultimodalLiveSession({
        systemPrompt: this.agent.systemPrompt,
        voiceName: this.agent.voice?.voiceId || 'Puck',
        allowInterruption: this.agent.allowInterruption !== false,
        onAudioOutput: (pcmBuffer, sampleRate) => {
          const resampledPcm = resamplePCM(pcmBuffer, sampleRate, 16000);
          const rawDurationMs = Math.round((resampledPcm.length / 32000) * 1000);
          this._setAgentSpeaking(rawDurationMs + 300);
          if (this.onAudioOutput) this.onAudioOutput(resampledPcm, 16000);
        },
        onTranscription: (text, role) => {
          if (role === 'agent' && this.onAgentTranscription) {
            this.onAgentTranscription(text);
          } else if (role === 'user' && this.onCustomerTranscription) {
            this.onCustomerTranscription(text);
          }
        },
        onInterrupted: () => {
          this._cancelAgentSpeech();
        },
        onError: (err) => {
          this._log('error', `Gemini Multimodal Live connection error: ${err.message}`);
          if (this.onError) this.onError(err);
        },
        onClose: (closeInfo = {}) => {
          this._log('info', 'Gemini Multimodal Live session closed');
          if (!this.isConnected || this._isSwitchingProvider || this.activeProvider !== 'geminilive') return;
          if (!closeInfo.wasSetupComplete) {
            this._fallbackToCustomProvider(`code=${closeInfo.code}, reason=${closeInfo.reason || 'unknown'}`);
          }
        },
      });
    } else if (this.activeProvider === 'customv2') {
      this.geminiSession = this._createCustomv2Session();
      this._initSarvamRealtimeStreams();
    } else {
      this.geminiSession = this._createCustomGeminiSession();
      this._initSarvamRealtimeStreams();
    }

    let hasPreRecordedFirstMessage = false;
    let preRecordedFilePath = null;

    if (this.activeProvider !== 'geminilive' && this.agent.firstMessageAudioPath) {
      preRecordedFilePath = path.resolve(process.cwd(), this.agent.firstMessageAudioPath);
      if (fs.existsSync(preRecordedFilePath)) {
        hasPreRecordedFirstMessage = true;
      }
    }

    this.geminiSession.connect(hasPreRecordedFirstMessage, this.agent.firstMessage);

    if (hasPreRecordedFirstMessage) {
      setImmediate(() => {
        this._playPreRecordedFirstMessage(preRecordedFilePath);
      });
    }
  }

  _usesSarvamRealtime() {
    return this.activeProvider === 'custom' || this.activeProvider === 'customv2';
  }

  _initSarvamRealtimeStreams() {
    const language = this.agent.language || defaults.sarvam.defaultLanguageCode;
    const voiceName = this.agent.voice?.voiceId || defaults.sarvam.defaultVoiceId;

    this.sarvamSttStream = new SarvamSTTStream({
      languageCode: 'unknown',
      onTranscript: (transcript, detectedLanguageCode) => {
        this._log('info', `[STT partial] ${transcript} (detected: ${detectedLanguageCode})`);
        if (detectedLanguageCode && detectedLanguageCode !== 'unknown') {
          this._updateTtsLanguage(detectedLanguageCode);
        }
        this._handleRealtimeTranscript(transcript);
      },
      onSpeechEnd: () => {
        this._log('info', '[STT] END_SPEECH detected — flushing transcript');
        if (this.sarvamSttStream) {
          this.sarvamSttStream.flush();
        }
        if (this.transcriptionSilenceTimer) {
          clearTimeout(this.transcriptionSilenceTimer);
        }
        this.transcriptionSilenceTimer = setTimeout(() => this._flushRealtimeTranscript(), 500);
      },
      onError: (err) => {
        this._log('error', `Sarvam STT WebSocket error: ${err.message}`);
      },
    });
    this.sarvamSttStream.connect();

    this.sarvamTtsStream = new SarvamTTSStream({
      languageCode: language,
      voiceId: voiceName,
      pace: this.agent.pace,
      temperature: this.agent.temperature,
      onAudioChunk: (audioBuffer) => {
        this._playTtsAudioChunk(audioBuffer, this._activeTtsGeneration);
      },
      onError: (err) => {
        this._log('error', `Sarvam TTS WebSocket error: ${err.message}`);
      },
    });
    this.sarvamTtsStream.connect();
  }

  _updateTtsLanguage(newLanguageCode) {
    if (!this.isConnected) return;

    const targetTtsLanguage = SARVAM_LOCALE_MAP[newLanguageCode] || newLanguageCode || 'en-IN';
    const currentTtsLanguage = this.sarvamTtsStream ? this.sarvamTtsStream.languageCode : null;

    if (currentTtsLanguage === targetTtsLanguage) {
      return;
    }

    this._log('info', `[TTS Language Switch] Detected customer language switch. Re-initializing TTS WebSocket from ${currentTtsLanguage} to ${targetTtsLanguage}`);

    if (this.sarvamTtsStream) {
      try {
        this.sarvamTtsStream.close();
      } catch (err) {
        // ignore close error
      }
    }

    const voiceName = this.agent.voice?.voiceId || defaults.sarvam.defaultVoiceId;
    this.sarvamTtsStream = new SarvamTTSStream({
      languageCode: targetTtsLanguage,
      voiceId: voiceName,
      pace: this.agent.pace,
      temperature: this.agent.temperature,
      onAudioChunk: (audioBuffer) => {
        this._playTtsAudioChunk(audioBuffer, this._activeTtsGeneration);
      },
      onError: (err) => {
        this._log('error', `Sarvam TTS WebSocket error: ${err.message}`);
      },
    });
    this.sarvamTtsStream.connect();
  }

  _cancelAgentSpeech() {
    this._ttsGeneration++;
    this._activeTtsGeneration = null;
    this.isAgentSpeaking = false;
    if (this.speakingTimeout) clearTimeout(this.speakingTimeout);
    if (this.onClearAudio) this.onClearAudio();
    if (this.geminiSession && typeof this.geminiSession.cancelStream === 'function') {
      this.geminiSession.cancelStream();
    }
  }

  _createCustomGeminiSession() {
    return new GeminiLiveSession({
      systemPrompt: this.agent.systemPrompt,
      model: defaults.gemini.liveModel,
      onResponseText: async (text) => {
        try {
          this._log('info', `Agent completed response: ${text}`);
          if (this.onAgentTranscription) this.onAgentTranscription(text);
        } catch (err) {
          this._log('error', `Gemini response logging failure: ${err.message}`);
        }
      },
      onResponseSentence: async (sentenceText, ttsGeneration) => {
        this._enqueueTtsPhrase(sentenceText, ttsGeneration);
      },
      onStartResponse: () => {
        const ttsGeneration = ++this._ttsGeneration;
        this._activeTtsGeneration = ttsGeneration;
        this._setAgentSpeaking(3000);
        return ttsGeneration;
      },
      onError: (err) => {
        this._log('error', `Gemini Live connection error: ${err.message}`);
        if (this.onError) this.onError(err);
      },
      onClose: () => {
        this._log('info', 'Gemini session closed');
      },
    });
  }

  _createCustomv2Session() {
    return new SarvamLiveSession({
      systemPrompt: this.agent.systemPrompt,
      model: defaults.sarvam.chatModel || 'sarvam-2b',
      onResponseText: async (text) => {
        try {
          this._log('info', `Agent completed response: ${text}`);
          if (this.onAgentTranscription) this.onAgentTranscription(text);
        } catch (err) {
          this._log('error', `Sarvam response logging failure: ${err.message}`);
        }
      },
      onResponseSentence: async (sentenceText, ttsGeneration) => {
        this._enqueueTtsPhrase(sentenceText, ttsGeneration);
      },
      onStartResponse: () => {
        const ttsGeneration = ++this._ttsGeneration;
        this._activeTtsGeneration = ttsGeneration;
        this._setAgentSpeaking(3000);
        return ttsGeneration;
      },
      onError: (err) => {
        this._log('error', `Sarvam Live connection error: ${err.message}`);
        if (this.onError) this.onError(err);
      },
      onClose: () => {
        this._log('info', 'Sarvam session closed');
      },
    });
  }

  _enqueueTtsPhrase(sentenceText, ttsGeneration) {
    try {
      const cleanText = stripMarkdown(sentenceText);
      if (!cleanText) return;

      this._ttsQueue = this._ttsQueue.then(() =>
        this._synthesizeAndPlay(cleanText, ttsGeneration)
      );
    } catch (err) {
      this._log('error', `TTS pipeline failure: ${err.message}`);
      if (this.onError) this.onError(err);
    }
  }

  _fallbackToCustomProvider(reason) {
    this._isSwitchingProvider = true;
    this._log('info', `[Provider Fallback] Gemini Live unavailable (${reason}). Switching to custom pipeline.`);

    try {
      if (this.geminiSession && typeof this.geminiSession.close === 'function') {
        this.geminiSession.close();
      }
    } catch (closeErr) {
      this._log('error', `[Provider Fallback] Failed closing live session: ${closeErr.message}`);
    }

    this.activeProvider = 'custom';
    this.geminiSession = this._createCustomGeminiSession();
    this._initSarvamRealtimeStreams();

    let hasPreRecordedFirstMessage = false;
    let preRecordedFilePath = null;
    if (this.agent.firstMessageAudioPath) {
      preRecordedFilePath = path.resolve(process.cwd(), this.agent.firstMessageAudioPath);
      hasPreRecordedFirstMessage = fs.existsSync(preRecordedFilePath);
    }

    this.geminiSession.connect(hasPreRecordedFirstMessage, this.agent.firstMessage);
    if (hasPreRecordedFirstMessage) {
      setImmediate(() => this._playPreRecordedFirstMessage(preRecordedFilePath));
    }

    this._isSwitchingProvider = false;
  }

  _setAgentSpeaking(durationMs) {
    this.isAgentSpeaking = true;
    if (this.speakingTimeout) clearTimeout(this.speakingTimeout);
    this.speakingTimeout = setTimeout(() => {
      this.isAgentSpeaking = false;
    }, durationMs);
  }

  _playTtsAudioChunk(audioBuffer, ttsGeneration) {
    if (!this.isConnected) return;
    if (ttsGeneration !== undefined && ttsGeneration !== this._ttsGeneration) return;

    let rawPcm = audioBuffer;
    let srcRate = 16000;
    if (audioBuffer.length > 44 && audioBuffer.toString('utf8', 8, 12) === 'WAVE') {
      srcRate = audioBuffer.readUInt32LE(24);
      rawPcm = audioBuffer.slice(44);
    }

    const TARGET_RATE = 16000;
    const resampledPcm = resamplePCM(rawPcm, srcRate, TARGET_RATE);
    const rawDurationMs = Math.round((resampledPcm.length / 32000) * 1000);
    this._setAgentSpeaking(rawDurationMs + 300);

    if (this.onAudioOutput) this.onAudioOutput(resampledPcm, TARGET_RATE);
  }

  async _synthesizeAndPlay(text, ttsGeneration) {
    if (!this.isConnected || !text.trim()) return;
    if (ttsGeneration !== undefined && ttsGeneration !== this._ttsGeneration) return;
    if (!this.sarvamTtsStream) return;

    try {
      const processedText = preprocessForTTS(text);
      this._activeTtsGeneration = ttsGeneration;

      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        const timeout = setTimeout(() => {
          this._log('warn', `TTS timeout for chunk "${text.substring(0, 40)}..."`);
          finish();
        }, 15000);

        this.sarvamTtsStream.sendText(processedText, () => {
          clearTimeout(timeout);
          finish();
        });
      });
    } catch (err) {
      this._log('error', `TTS synthesis failure for chunk "${text}": ${err.message}`);
    }
  }

  _playPreRecordedFirstMessage(filePath) {
    try {
      this._log('info', `Playing pre-recorded first message audio from ${filePath}`);
      const audioBuffer = fs.readFileSync(filePath);
      if (audioBuffer.length > 44) {
        if (this.onAgentTranscription && this.agent.firstMessage) {
          this.onAgentTranscription(this.agent.firstMessage);
        }

        const audioDurationMs = wavDurationMs(audioBuffer);
        this._setAgentSpeaking(audioDurationMs + 300);
        this._log('info', `Pre-recorded first message duration: ${audioDurationMs}ms`);

        const srcRate = audioBuffer.readUInt32LE(24);
        const rawPcm = audioBuffer.slice(44);
        const TARGET_RATE = 16000;
        const resampledPcm = resamplePCM(rawPcm, srcRate, TARGET_RATE);

        if (this.onAudioOutput) {
          this.onAudioOutput(resampledPcm, TARGET_RATE);
        }
      }
    } catch (err) {
      this._log('error', `Error playing pre-recorded first message: ${err.message}`);
    }
  }

  _log(level, message) {
    if (this.onLog) this.onLog(level, message);
    if (level === 'error') console.error(message);
    else console.log(message);
  }

  _handleRealtimeTranscript(transcript) {
    if (!transcript || !transcript.trim()) return;

    if (this.transcriptionSilenceTimer) {
      clearTimeout(this.transcriptionSilenceTimer);
    }

    this.accumulatedTranscript = transcript;

    this.transcriptionSilenceTimer = setTimeout(() => {
      this._flushRealtimeTranscript();
    }, this.SILENCE_TIMEOUT_MS);
  }

  _flushRealtimeTranscript() {
    const finalTranscript = (this.accumulatedTranscript || '').trim();
    if (!finalTranscript) {
      if (this.transcriptionSilenceTimer) {
        clearTimeout(this.transcriptionSilenceTimer);
        this.transcriptionSilenceTimer = null;
      }
      return;
    }

    if (!this.agent.allowInterruption && this.isAgentSpeaking) {
      this._log('info', `[Interruption Blocked] Customer spoke: "${finalTranscript}" — agent still speaking, waiting.`);
      return;
    }

    this.accumulatedTranscript = '';
    if (this.transcriptionSilenceTimer) {
      clearTimeout(this.transcriptionSilenceTimer);
      this.transcriptionSilenceTimer = null;
    }

    if (this.isAgentSpeaking) {
      this._cancelAgentSpeech();
    }

    this._log('info', `Customer spoke (real-time WSS): ${finalTranscript}`);
    if (this.onCustomerTranscription) this.onCustomerTranscription(finalTranscript);
    this.geminiSession.sendUserTurn(finalTranscript);
  }

  async handleAudioInput(pcmBuffer) {
    if (!this.isConnected) return;

    if (this.activeProvider === 'geminilive') {
      if (!this.agent.allowInterruption && this.isAgentSpeaking) {
        return;
      }
      if (this.geminiSession && typeof this.geminiSession.sendAudioChunk === 'function') {
        this.geminiSession.sendAudioChunk(pcmBuffer);
      }
    } else if (this._usesSarvamRealtime() && this.sarvamSttStream) {
      if (!this.agent.allowInterruption && this.isAgentSpeaking) {
        return;
      }
      this.sarvamSttStream.sendAudio(pcmBuffer);
    }
  }

  async flushPendingInput() {
    if (!this._usesSarvamRealtime()) return;

    if (this.sarvamSttStream) {
      this.sarvamSttStream.flush();
    }
    this._flushRealtimeTranscript();
  }

  async close() {
    this.isConnected = false;
    if (this.speakingTimeout) { clearTimeout(this.speakingTimeout); this.speakingTimeout = null; }
    if (this.transcriptionSilenceTimer) { clearTimeout(this.transcriptionSilenceTimer); this.transcriptionSilenceTimer = null; }
    await this.flushPendingInput();
    if (this.sarvamSttStream) {
      this.sarvamSttStream.close();
      this.sarvamSttStream = null;
    }
    if (this.sarvamTtsStream) {
      this.sarvamTtsStream.close();
      this.sarvamTtsStream = null;
    }
    this.geminiSession.close();
  }
}

module.exports = VoicePipeline;
