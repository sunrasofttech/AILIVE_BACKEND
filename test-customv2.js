const { createAgentSchema } = require('./src/validators/agent');
const { SarvamLiveSession } = require('./src/services/sarvamLiveService');
const { GeminiLiveSession } = require('./src/services/geminiLiveService');
const { SarvamSTTStream, SarvamTTSStream } = require('./src/services/sarvamSocketService');
const VoicePipeline = require('./src/services/voicePipeline');
const defaults = require('./src/config/defaults');

async function testJoiValidation() {
  console.log('\n--- 1. Testing Joi Validation ---');
  const validData = {
    name: 'Test Agent',
    systemPrompt: 'You are a friendly assistant.',
    voiceId: '00000000-0000-0000-0000-000000000000',
    aiProvider: 'customv2',
  };

  const { error, value } = createAgentSchema.validate(validData);
  if (error) {
    console.error('❌ Validation failed unexpectedly:', error.details);
    throw error;
  }
  console.log('✅ Validation passed successfully for customv2 provider:', value);
}

async function testMockSarvamLiveSession() {
  console.log('\n--- 2. Testing Mock SarvamLiveSession ---');
  return new Promise((resolve) => {
    const session = new SarvamLiveSession({
      systemPrompt: 'You are a mock test assistant.',
      model: defaults.sarvam.chatModel || 'sarvam-105b',
      onResponseText: (text) => {
        console.log(`✅ [Mock Completed Text]: ${text}`);
        session.close();
        resolve();
      },
      onResponseSentence: (sentence, ttsGen) => {
        console.log(` > [Mock Sentence (Gen ${ttsGen})]: "${sentence}"`);
      },
      onStartResponse: () => {
        const gen = 1;
        console.log(` > [Mock Started Response] gen = ${gen}`);
        return gen;
      },
      onError: (err) => {
        console.error('❌ [Mock Error]:', err.message);
      },
    });

    // Explicitly override apiKey to force mock mode
    session.apiKey = 'your_sarvam_api_key';

    console.log('Connecting to mock session...');
    session.connect(false);
  });
}

async function testRealSarvamLiveSession() {
  console.log('\n--- 3. Testing Real SarvamLiveSession ---');
  const apiKey = defaults.sarvam.apiKey;
  if (!apiKey || apiKey === 'your_sarvam_api_key') {
    console.log('⚠️ Skipping Real SarvamLiveSession test: No valid SARVAM_API_KEY found in .env');
    return;
  }

  return new Promise((resolve) => {
    const session = new SarvamLiveSession({
      systemPrompt: 'You are a concise virtual assistant on a call. Greet the customer and keep answers extremely short, under 10 words.',
      model: defaults.sarvam.chatModel || 'sarvam-105b',
      onResponseText: (text) => {
        console.log(`✅ [Real Completed Text]: ${text}`);
        console.log('Testing interruption cancellation...');
        
        // Start a turn
        session.sendUserTurn('Hello, who are you?');
        // Immediately abort it
        console.log('Immediately calling cancelStream()...');
        session.cancelStream();
        
        session.close();
        resolve();
      },
      onResponseSentence: (sentence, ttsGen) => {
        console.log(` > [Real Sentence (Gen ${ttsGen})]: "${sentence}"`);
      },
      onStartResponse: () => {
        const gen = Date.now();
        console.log(` > [Real Started Response] gen = ${gen}`);
        return gen;
      },
      onError: (err) => {
        console.error('❌ [Real Error]:', err.message);
        session.close();
        resolve();
      },
    });

    console.log('Connecting to real session...');
    session.connect(false);
  });
}

async function testVoicePipelineIntegration() {
  console.log('\n--- 4. Testing VoicePipeline Integration (Mock mode) ---');

  const dummyAgent = {
    aiProvider: 'customv2',
    systemPrompt: 'Greet the caller and ask for their email address.',
    language: 'en-IN',
    voice: { voiceId: 'shubh' },
    pace: 1.0,
    temperature: 0.6,
    firstMessage: 'Welcome to customv2 test. How are you today?',
    firstMessageAudioPath: null,
  };

  const pipeline = new VoicePipeline({
    agent: dummyAgent,
    onAudioOutput: (pcmBuffer, sampleRate) => {
      console.log(` > [Pipeline Audio Output] Recieved ${pcmBuffer.length} bytes at ${sampleRate}Hz`);
    },
    onAgentTranscription: (text) => {
      console.log(`✅ [Pipeline Agent Transcription]: "${text}"`);
    },
    onCustomerTranscription: (text) => {
      console.log(`✅ [Pipeline Customer Transcription]: "${text}"`);
    },
    onError: (err) => {
      console.error('❌ [Pipeline Error]:', err.message);
    },
    onLog: (level, msg) => {
      console.log(`[Pipeline Log][${level}]: ${msg}`);
    },
  });

  // Force mock mode on the instantiated session
  pipeline.geminiSession.apiKey = 'your_sarvam_api_key';

  // Verify STT was initialized with 'unknown'
  if (pipeline.sarvamSttStream.languageCode !== 'unknown') {
    throw new Error(`Expected STT languageCode to be 'unknown', got ${pipeline.sarvamSttStream.languageCode}`);
  }
  console.log('✅ Verified STT stream initialized with languageCode "unknown"');

  // Trigger language detection callback simulating user speaking Hindi
  console.log('Simulating STT language detection: "hi-IN"');
  const originalTtsStream = pipeline.sarvamTtsStream;
  pipeline.sarvamSttStream.onTranscript('कॉल क्यों की है', 'hi-IN');

  // Check if TTS stream was re-created with hi-IN
  if (pipeline.sarvamTtsStream === originalTtsStream) {
    throw new Error('Expected TTS stream to be re-created upon language detection');
  }
  if (pipeline.sarvamTtsStream.languageCode !== 'hi-IN') {
    throw new Error(`Expected new TTS stream languageCode to be 'hi-IN', got ${pipeline.sarvamTtsStream.languageCode}`);
  }
  console.log('✅ Verified dynamic TTS stream re-creation and switch to "hi-IN" successful');

  // Wait for greeting to play and clean up
  await new Promise((res) => setTimeout(res, 3000));
  
  console.log('Simulating customer transcription turn...');
  // Simulating sending a user turn transcript to trigger LLM streaming response
  pipeline.geminiSession.sendUserTurn('I am interested in scheduling a callback.');
  
  await new Promise((res) => setTimeout(res, 3000));
  
  console.log('Closing pipeline...');
  await pipeline.close();
  console.log('✅ VoicePipeline integration test finished.');
}

async function testRealGeminiLiveSession() {
  console.log('\n--- 3.5 Testing Real GeminiLiveSession ---');
  const apiKey = defaults.gemini.apiKey;
  if (!apiKey || apiKey === 'your_google_gemini_api_key') {
    console.log('⚠️ Skipping Real GeminiLiveSession test: No valid GEMINI_API_KEY found in .env');
    return;
  }

  return new Promise((resolve) => {
    const session = new GeminiLiveSession({
      systemPrompt: 'You are a concise virtual assistant on a call. Greet the customer and keep answers extremely short, under 10 words.',
      model: defaults.gemini.liveModel || 'gemini-1.5-flash',
      onResponseText: (text) => {
        console.log(`✅ [Real Gemini Completed Text]: ${text}`);
        console.log('Testing Gemini interruption cancellation...');
        
        // Start a turn
        session.sendUserTurn('Hello, who are you?');
        // Immediately abort it
        console.log('Immediately calling cancelStream()...');
        session.cancelStream();
        
        session.close();
        resolve();
      },
      onResponseSentence: (sentence, ttsGen) => {
        console.log(` > [Real Gemini Sentence (Gen ${ttsGen})]: "${sentence}"`);
      },
      onStartResponse: () => {
        const gen = Date.now();
        console.log(` > [Real Gemini Started Response] gen = ${gen}`);
        return gen;
      },
      onError: (err) => {
        console.error('❌ [Real Gemini Error]:', err.message);
        session.close();
        resolve();
      },
    });

    console.log('Connecting to real Gemini session...');
    session.connect(false);
  });
}

async function testRealSarvamWebSockets() {
  console.log('\n--- 3.7 Testing Sarvam STT & TTS WebSockets (Mock & Real checks) ---');
  
  // 1. STT WebSocket Mock check
  console.log('Testing Mock STT WebSocket...');
  const sttMock = new SarvamSTTStream({
    languageCode: 'en-IN',
    onTranscript: (transcript) => {
      console.log(` > [Mock STT Transcript]: "${transcript}"`);
    },
  });
  sttMock.connect();
  sttMock.sendAudio(Buffer.alloc(1000));
  await new Promise(res => setTimeout(res, 1000));
  sttMock.close();

  // 2. TTS WebSocket Mock check
  console.log('Testing Mock TTS WebSocket...');
  await new Promise((resolve) => {
    const ttsMock = new SarvamTTSStream({
      languageCode: 'en-IN',
      voiceId: 'shubh',
      onAudioChunk: (buf) => {
        console.log(` > [Mock TTS Audio Chunk]: Received ${buf.length} bytes`);
      },
      onError: (err) => {
        console.error('❌ [Mock TTS Error]:', err.message);
        ttsMock.close();
        resolve();
      },
    });
    ttsMock.connect();
    ttsMock.sendText('Hello, this is a websocket streaming test.', () => {
      console.log(' > [Mock TTS Done]');
      ttsMock.close();
      resolve();
    });
  });

  // 3. Real WSS check if API key exists
  const apiKey = defaults.sarvam.apiKey;
  if (!apiKey || apiKey === 'your_sarvam_api_key') {
    console.log('⚠️ Skipping Real STT/TTS WebSocket tests: No valid SARVAM_API_KEY found in .env');
    return;
  }

  console.log('Testing Real TTS WebSocket (streamed)...');
  await new Promise((resolve) => {
    const ttsReal = new SarvamTTSStream({
      languageCode: 'en-IN',
      voiceId: 'shubh',
      onAudioChunk: (buf) => {
        console.log(` > [Real TTS Audio Chunk]: Received ${buf.length} bytes`);
      },
      onError: (err) => {
        console.error('❌ [Real TTS Error]:', err.message);
        ttsReal.close();
        resolve();
      },
    });
    ttsReal.connect();
    ttsReal.sendText('Hello.', () => {
      console.log(' > [Real TTS Done]');
      ttsReal.close();
      resolve();
    });
  });
}

async function main() {
  try {
    await testJoiValidation();
    await testMockSarvamLiveSession();
    await testRealSarvamLiveSession();
    await testRealGeminiLiveSession();
    await testRealSarvamWebSockets();
    await testVoicePipelineIntegration();
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('\n❌ Test execution failed:', err);
    process.exit(1);
  }
}

main();
