const { sequelize, User, Agent, Voice } = require('../src/models');
const agentController = require('../src/controllers/agentController');
const fs = require('fs');

async function testFirstMessage() {
  console.log('Testing first_message feature...');
  await sequelize.sync({ force: true });
  
  const { seedVoices } = require('../src/utils/seeder');
  await seedVoices();

  const user = await User.create({
    email: 'test@example.com',
    mobile: '+1000000000',
    passwordHash: 'hash',
    businessName: 'Test',
    isVerified: true,
  });

  const voice = await Voice.findOne();

  // Mock Request & Response
  const req = {
    user: { id: user.id },
    body: {
      name: 'Test Agent',
      systemPrompt: 'You are a test agent',
      voiceId: voice.id,
      firstMessage: 'Welcome to the test agency. How can I assist you?',
    }
  };

  const res = {
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) { this.data = data; }
  };

  await agentController.create(req, res, (err) => { console.error('Next called with error:', err); });

  console.log('Agent created:', res.data.data.name);
  console.log('firstMessage:', res.data.data.firstMessage);
  console.log('firstMessageAudioPath:', res.data.data.firstMessageAudioPath);

  if (res.data.data.firstMessageAudioPath && fs.existsSync(res.data.data.firstMessageAudioPath)) {
    console.log('SUCCESS: Audio file exists!');
  } else {
    console.error('FAILED: Audio file does not exist.');
  }
  
  process.exit(0);
}

testFirstMessage().catch(err => {
  console.error(err);
  process.exit(1);
});
