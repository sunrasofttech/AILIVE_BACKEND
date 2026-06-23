const { GeminiLiveSession } = require('./geminiLiveService');
const SarvamService = require('./sarvamService');
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
    .replace(/\*\*(.*?)\*\*/g, '$1')  // bold
    .replace(/\*(.*?)\*/g, '$1')       // italic
    .replace(/`([^`]*)`/g, '$1')       // inline code
    .replace(/#{1,6}\s/g, '')          // headings
    .replace(/^\s*[-*+]\s+/gm, '')    // bullet points
    .replace(/^\s*\d+\.\s+/gm, '')   // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/\n{3,}/g, '\n\n')       // excess newlines
    .trim();
}

/**
 * VoicePipeline orchestrates the audio processing loop independent of the transport layer.
 * It handles STT transcription, Gemini responses, and TTS synthesis.
 */
class VoicePipeline {
  constructor(options) {
    this.agent = options.agent;
    this.onAudioOutput = options.onAudioOutput; // (pcmBuffer, sampleRate)
    this.onClearAudio = options.onClearAudio;   // ()
    this.onAgentTranscription = options.onAgentTranscription; // (text)
    this.onCustomerTranscription = options.onCustomerTranscription; // (text)
    this.onError = options.onError; // (error)
    this.onLog = options.onLog; // (level, message)

    this.isAgentSpeaking = false;
    this.speakingTimeout = null;

    this.audioInputBuffer = [];
    this.silenceTimer = null;
    this.maxDurationTimer = null;
    this.SILENCE_TIMEOUT_MS = 200;
    this.MAX_BUFFER_DURATION_MS = 2000;
    this.MIN_BUFFER_BYTES = 1600;

    this.isConnected = true;

    this._log('info', 'Initializing VoicePipeline with Gemini and Sarvam...');

    this.geminiSession = new GeminiLiveSession({
      systemPrompt: this.agent.systemPrompt,
      model: defaults.gemini.liveModel,
      onResponseText: async (text) => {
        try {
          this._log('info', `Agent responded: ${text}`);
          if (this.onAgentTranscription) this.onAgentTranscription(text);

          this.isAgentSpeaking = true;
          const wordCount = text.split(/\s+/).filter(Boolean).length;
          const durationMs = Math.max(1500, wordCount * 450); // ~450ms per word, min 1.5s
          if (this.speakingTimeout) clearTimeout(this.speakingTimeout);
          this.speakingTimeout = setTimeout(() => {
            this.isAgentSpeaking = false;
          }, durationMs);

          const cleanText = stripMarkdown(text);
          if (!cleanText) return;

          const voiceName = this.agent.voice?.voiceId || defaults.sarvam.defaultVoiceId;
          const language = this.agent.language || defaults.sarvam.defaultLanguageCode;

          const audioBuffer = await SarvamService.synthesizeText(cleanText, voiceName, language, {
            pace: this.agent.pace,
            temperature: this.agent.temperature,
          });

          if (this.isConnected && audioBuffer.length > 44) {
            const srcRate = audioBuffer.readUInt32LE(24);
            const rawPcm = audioBuffer.slice(44);
            const TARGET_RATE = 16000;
            const resampledPcm = resamplePCM(rawPcm, srcRate, TARGET_RATE);
            if (this.onAudioOutput) this.onAudioOutput(resampledPcm, TARGET_RATE);
          }
        } catch (err) {
          this._log('error', `TTS synthesis failure: ${err.message}`);
          if (this.onError) this.onError(err);
        }
      },
      onError: (err) => {
        this._log('error', `Gemini Live connection error: ${err.message}`);
        if (this.onError) this.onError(err);
      },
      onClose: () => {
        this._log('info', 'Gemini session closed');
      },
    });

    let hasPreRecordedFirstMessage = false;
    let preRecordedFilePath = null;

    if (this.agent.firstMessageAudioPath) {
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

  _playPreRecordedFirstMessage(filePath) {
    try {
      this._log('info', `Playing pre-recorded first message audio from ${filePath}`);
      const audioBuffer = fs.readFileSync(filePath);
      if (audioBuffer.length > 44) {
        const srcRate = audioBuffer.readUInt32LE(24);
        const rawPcm = audioBuffer.slice(44);
        const TARGET_RATE = 16000;
        const resampledPcm = resamplePCM(rawPcm, srcRate, TARGET_RATE);

        if (this.onAgentTranscription && this.agent.firstMessage) {
          this.onAgentTranscription(this.agent.firstMessage);
        }
        
        this.isAgentSpeaking = true;
        const wordCount = (this.agent.firstMessage || '').split(/\s+/).filter(Boolean).length;
        const durationMs = Math.max(1500, wordCount * 450);
        if (this.speakingTimeout) clearTimeout(this.speakingTimeout);
        this.speakingTimeout = setTimeout(() => {
          this.isAgentSpeaking = false;
        }, durationMs);

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

  /**
   * Handle incoming raw PCM buffer from user's microphone/telephone.
   * Note: Expects 16000Hz L16 format.
   * @param {Buffer} pcmBuffer 
   */
  async handleAudioInput(pcmBuffer) {
    if (!this.isConnected) return;

    this.audioInputBuffer.push(pcmBuffer);

    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.flushAudioBuffer(), this.SILENCE_TIMEOUT_MS);

    if (!this.maxDurationTimer) {
      this.maxDurationTimer = setTimeout(() => this.flushAudioBuffer(), this.MAX_BUFFER_DURATION_MS);
    }
  }

  /**
   * Transcribe buffered audio and send to Gemini.
   */
  async flushAudioBuffer() {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    if (this.maxDurationTimer) { clearTimeout(this.maxDurationTimer); this.maxDurationTimer = null; }

    if (this.audioInputBuffer.length === 0) return;
    const combinedBuffer = Buffer.concat(this.audioInputBuffer);
    this.audioInputBuffer = [];

    if (combinedBuffer.length < this.MIN_BUFFER_BYTES || !this.isConnected) return;

    try {
      const transcript = await SarvamService.transcribeAudioChunk(combinedBuffer, this.agent.language);

      if (transcript && transcript.trim()) {
        if (!this.agent.allowInterruption && this.isAgentSpeaking) {
          this._log('info', `[Interruption Blocked] Customer spoke: "${transcript}"`);
          return;
        }

        if (this.isAgentSpeaking) {
          this.isAgentSpeaking = false;
          if (this.speakingTimeout) clearTimeout(this.speakingTimeout);
          if (this.onClearAudio) this.onClearAudio();
        }

        this._log('info', `Customer spoke: ${transcript}`);
        if (this.onCustomerTranscription) this.onCustomerTranscription(transcript);
        this.geminiSession.sendUserTurn(transcript);
      }
    } catch (err) {
      this._log('error', `[STT] Transcription error: ${err.message}`);
    }
  }

  /**
   * Close connections and clean up resources.
   */
  async close() {
    this.isConnected = false;
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    if (this.maxDurationTimer) { clearTimeout(this.maxDurationTimer); this.maxDurationTimer = null; }
    if (this.speakingTimeout) { clearTimeout(this.speakingTimeout); this.speakingTimeout = null; }
    await this.flushAudioBuffer();
    this.geminiSession.close();
  }
}

module.exports = VoicePipeline;
