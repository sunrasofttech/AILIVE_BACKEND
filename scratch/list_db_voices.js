const { Voice } = require('../src/models');

async function listVoices() {
  try {
    const voices = await Voice.findAll();
    console.log('--- Database Voices ---');
    console.log(voices.map(v => ({ id: v.id, name: v.name, provider: v.provider, voiceId: v.voiceId })));
    process.exit(0);
  } catch (err) {
    console.error('Error fetching voices:', err);
    process.exit(1);
  }
}

listVoices();
