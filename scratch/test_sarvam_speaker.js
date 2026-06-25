const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.SARVAM_API_KEY;
if (!apiKey) {
  console.error('No SARVAM_API_KEY found in .env');
  process.exit(1);
}

async function testVoice(voiceId) {
  const url = 'https://api.sarvam.ai/text-to-speech';
  try {
    // Let's test with 'speaker' field instead of 'voice'
    const response = await axios.post(
      url,
      {
        inputs: ['Hello, this is a test of the speaker ' + voiceId],
        speaker: voiceId, // Using speaker instead of voice
        voice: voiceId,   // Keep voice just in case
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
      require('fs').writeFileSync(`scratch/test_speaker_${voiceId}.wav`, buf);
      console.log(`  [SUCCESS] Wrote scratch/test_speaker_${voiceId}.wav, size: ${buf.length}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error('  Error:', err.response ? err.response.data : err.message);
    return false;
  }
}

async function run() {
  await testVoice('shubh');
  await testVoice('amit');
  await testVoice('roopa');
}

run();
