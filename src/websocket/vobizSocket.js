const url = require('url');
const { CallSession, Agent, Voice, CallLog, Campaign } = require('../models');
const { GeminiLiveSession } = require('../services/geminiLiveService');
const SarvamService = require('../services/sarvamService');
const QueueService = require('../services/queueService');
const { redisClient } = require('../config/redis');
const defaults = require('../config/defaults');

class VobizSocketHandler {
  /**
   * Handle incoming WebSocket connection from VoBiz
   * @param {WebSocket} ws 
   * @param {IncomingMessage} req 
   */
  async handleConnection(ws, req) {
    const parameters = url.parse(req.url, true).query;
    const token = parameters.token;

    if (!token) {
      console.error('WS Connection rejected: Missing token');
      ws.close(4001, 'Unauthorized: Missing session token');
      return;
    }

    try {
      // 1. Authenticate connection against Call Session
      const session = await CallSession.findOne({
        where: { wsSessionToken: token },
        include: [
          {
            model: Agent,
            as: 'agent',
            include: [{ model: Voice, as: 'voice' }],
          },
        ],
      });

      if (!session) {
        console.error(`WS Connection rejected: Invalid token "${token}"`);
        ws.close(4002, 'Unauthorized: Invalid session token');
        return;
      }

      if (session.status === 'completed' || session.status === 'failed') {
        ws.close(4003, 'Session already terminated');
        return;
      }

      console.log(`VoBiz Connection established for Call Session: ${session.id}`);

      // Update session status to connected
      session.status = 'connected';
      session.startTime = new Date();
      await session.save();

      await CallLog.create({
        callSessionId: session.id,
        logLevel: 'info',
        message: 'VoBiz WebSocket connected and call established',
      });

      // Keep running transcript memory in memory
      const transcriptChunks = [];
      const audioChunks = [];

      // 2. Instantiate Gemini Live Session
      const geminiSession = new GeminiLiveSession({
        systemPrompt: session.agent.systemPrompt,
        model: defaults.gemini.liveModel,
        onResponseText: async (text) => {
          try {
            console.log(`[Gemini Response]: ${text}`);
            transcriptChunks.push({ role: 'agent', text });

            // Track agent speaking state
            ws.isAgentSpeaking = true;
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            const durationMs = Math.max(1500, wordCount * 450); // ~450ms per word, min 1.5s
            if (ws.speakingTimeout) {
              clearTimeout(ws.speakingTimeout);
            }
            ws.speakingTimeout = setTimeout(() => {
              ws.isAgentSpeaking = false;
            }, durationMs);

            await CallLog.create({
              callSessionId: session.id,
              logLevel: 'info',
              message: `Agent responded: ${text}`,
            });

            // Synthesize Response text -> Voice Audio
            const voiceName = session.agent.voice.voiceId;
            const language = session.agent.language;
            const audioBuffer = await SarvamService.synthesizeText(text, voiceName, language, {
              pace: session.agent.pace,
              temperature: session.agent.temperature,
            });

            // Send audio back to VoBiz as JSON playAudio event
            // Sarvam returns WAV (with 44-byte header) — strip header to get raw PCM
            if (ws.readyState === ws.OPEN) {
              const rawPcm = audioBuffer.length > 44
                ? audioBuffer.slice(44)   // strip WAV header
                : audioBuffer;
              const playAudioEvent = JSON.stringify({
                event: 'playAudio',
                media: {
                  contentType: 'audio/x-l16',
                  sampleRate: 16000,
                  payload: rawPcm.toString('base64'),
                },
              });
              ws.send(playAudioEvent);
              audioChunks.push(rawPcm);
            }
          } catch (ttsErr) {
            console.error('Failed to synthesize agent speech:', ttsErr);
            await CallLog.create({
              callSessionId: session.id,
              logLevel: 'error',
              message: `TTS synthesis failure: ${ttsErr.message}`,
            });
          }
        },
        onError: async (err) => {
          console.error(`Gemini session error for call ${session.id}:`, err);
          await CallLog.create({
            callSessionId: session.id,
            logLevel: 'error',
            message: `Gemini Live connection error: ${err.message}`,
          });
        },
        onClose: () => {
          console.log(`Gemini session closed for call ${session.id}`);
        },
      });

      // Connect to Google Gemini
      geminiSession.connect();

      // Store references on the WebSocket object for cleanup
      ws.session = session;
      ws.geminiSession = geminiSession;
      ws.transcriptChunks = transcriptChunks;
      ws.audioChunks = audioChunks;

      // 3. Handle incoming customer audio stream
      // VoBiz sends JSON frames with events: 'start', 'media', 'stop'
      ws.on('message', async (message, isBinary) => {
        try {
          // VoBiz always sends text JSON frames, not raw binary
          const frame = JSON.parse(message.toString());

          if (frame.event === 'start') {
            console.log(`[VoBiz Stream] Call started. StreamId: ${frame.start?.streamId}`);
            return;
          }

          if (frame.event === 'stop') {
            console.log(`[VoBiz Stream] Call stopped by VoBiz.`);
            return;
          }

          if (frame.event === 'media' && frame.media?.payload) {
            // Decode base64 audio payload (raw mulaw or L16 PCM, no WAV header)
            const audioBuffer = Buffer.from(frame.media.payload, 'base64');
            audioChunks.push(audioBuffer);

            // Transcribe via Sarvam STT
            const transcript = await SarvamService.transcribeAudioChunk(
              audioBuffer,
              session.agent.language
            );

            if (transcript && transcript.trim()) {
              // Enforce interruption logic
              if (!session.agent.allowInterruption && ws.isAgentSpeaking) {
                console.log(`[Interruption Blocked] Customer spoke: "${transcript}" but agent is speaking.`);
                return;
              }

              // Interruption allowed: reset agent speaking state
              if (ws.isAgentSpeaking) {
                ws.isAgentSpeaking = false;
                if (ws.speakingTimeout) clearTimeout(ws.speakingTimeout);
                // Signal VoBiz to clear its audio playback buffer
                if (ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify({ event: 'clearAudio' }));
                }
              }

              console.log(`[Customer Speech]: ${transcript}`);
              transcriptChunks.push({ role: 'customer', text: transcript });

              await CallLog.create({
                callSessionId: session.id,
                logLevel: 'info',
                message: `Customer spoke: ${transcript}`,
              });

              // Feed text transcript to Gemini
              geminiSession.sendUserTurn(transcript);
            }
          }
        } catch (msgErr) {
          console.error('Error handling VoBiz stream frame:', msgErr);
        }
      });

      // 4. Handle Disconnects & Session Cleanup
      ws.on('close', async (code, reason) => {
        console.log(`VoBiz WebSocket connection closed for session ${session.id}. Code: ${code}`);
        await this._cleanupSession(ws);
      });

      ws.on('error', async (error) => {
        console.error(`WebSocket error in session ${session.id}:`, error);
        await CallLog.create({
          callSessionId: session.id,
          logLevel: 'error',
          message: `WebSocket session error: ${error.message}`,
        });
      });

    } catch (err) {
      console.error('WebSocket connection setup crash:', err);
      ws.close(1011, 'Internal connection error');
    }
  }

  /**
   * Finalize call records, save logs, decrement concurrency counters, and wake up AI worker
   */
  async _cleanupSession(ws) {
    const { session, geminiSession, transcriptChunks } = ws;
    if (!session) return;

    try {
      // Clear speaking timeout
      if (ws.speakingTimeout) {
        clearTimeout(ws.speakingTimeout);
      }

      // Disconnect Gemini
      if (geminiSession) {
        geminiSession.close();
      }

      const freshSession = await CallSession.findByPk(session.id);
      if (freshSession && freshSession.status === 'connected') {
        freshSession.status = 'completed';
        freshSession.endTime = new Date();
        await freshSession.save();

        await CallLog.create({
          callSessionId: session.id,
          logLevel: 'info',
          message: 'Call session finished. WebSocket closed.',
        });

        // Decrement concurrency tracker via ZSET deregistration
        if (session.campaignId) {
          await QueueService.deregisterActiveCall(session.campaignId, session.id);
        }

        // Standardize transcript as a formatted text
        const formattedTranscript = transcriptChunks
          .map((c) => `${c.role === 'customer' ? 'Customer' : 'Agent'}: ${c.text}`)
          .join('\n');

        // Compile conversation recording
        let fileName = null;
        if (ws.audioChunks && ws.audioChunks.length > 0) {
          try {
            const fs = require('fs');
            const path = require('path');
            const uploadsDir = path.join(__dirname, '../../uploads');
            if (!fs.existsSync(uploadsDir)) {
              fs.mkdirSync(uploadsDir, { recursive: true });
            }
            fileName = `recording-${session.id}.wav`;
            const filePath = path.join(uploadsDir, fileName);
            const recordingBuffer = Buffer.concat(ws.audioChunks);
            fs.writeFileSync(filePath, recordingBuffer);
            console.log(`Saved call recording to ${filePath}`);
          } catch (recordErr) {
            console.error('Failed to save call recording:', recordErr);
          }
        }

        // Reliable report queuing
        const completionEvent = {
          callSessionId: session.id,
          userId: session.userId,
          campaignId: session.campaignId,
          vobizNumberId: session.vobizNumberId,
          customerId: session.customerId,
          transcript: formattedTranscript,
          duration: Math.round(
            (freshSession.endTime.getTime() - freshSession.startTime.getTime()) / 1000
          ),
          recordingUrl: fileName ? `/uploads/${fileName}` : null,
        };

        // Enqueue report for worker processing (Reliable Queue)
        await QueueService.enqueueReport(completionEvent);

        // Clear memory references to prevent socket memory leaks
        ws.audioChunks = null;
        ws.transcriptChunks = null;
      }
    } catch (cleanError) {
      console.error('Error during call session cleanup:', cleanError);
    }
  }
}

module.exports = new VobizSocketHandler();
