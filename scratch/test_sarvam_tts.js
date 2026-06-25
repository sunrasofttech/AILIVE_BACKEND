const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.SARVAM_API_KEY;
if (!apiKey) {
  console.error('No SARVAM_API_KEY found in .env');
  process.exit(1);
}

async function testSarvamVoice(voiceId) {
  const url = 'https://api.sarvam.ai/text-to-speech';
  try {
    console.log(`Calling Sarvam AI TTS for voice: ${voiceId}`);
    const response = await axios.post(
      url,
      {
        inputs: ['Hello, this is a test of the voice ' + voiceId],
        voice: voiceId,
        language_code: 'en-IN',
        model: 'bulbul:v3',
        pace: 1.0,
        temperature: 0.6,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': apiKey,
        },
      }
    );

    if (response.data && response.data.audios && response.data.audios[0]) {
      const buf = Buffer.from(response.data.audios[0], 'base64');
      require('fs').writeFileSync(`scratch/test_sarvam_${voiceId}.wav`, buf);
      console.log(`  [SUCCESS] Wrote scratch/test_sarvam_${voiceId}.wav, size: ${buf.length}`);
      return true;
    }
    console.log('  No audio returned.');
    return false;
  } catch (err) {
    console.error('  Error:', err.response ? err.response.data : err.message);
    return false;
  }
}

async function run() {
  await testSarvamVoice('shubh');
  await testSarvamVoice('amit');
  await testSarvamVoice('roopa');
}

run();
