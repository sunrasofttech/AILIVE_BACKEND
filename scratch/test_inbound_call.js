const VobizController = require('../src/controllers/vobizController');
const { VobizNumber, Agent, User, Customer, CallSession, CallLog } = require('../src/models');

async function testInboundCall() {
  try {
    console.log('Finding a merchant and an agent in the DB...');
    const agent = await Agent.findOne();
    if (!agent) {
      console.error('No agent found in DB to test. Please create an agent first.');
      process.exit(1);
    }
    
    const merchantId = agent.userId;
    console.log(`Found Merchant ID: ${merchantId}, Agent ID: ${agent.id} (Name: ${agent.name})`);

    // Find or create a VoBiz number for this merchant
    const testNumber = '+19998887777';
    let vobizNumber = await VobizNumber.findOne({ where: { userId: merchantId, number: testNumber } });
    if (!vobizNumber) {
      console.log(`Creating test VoBiz number: ${testNumber}`);
      vobizNumber = await VobizNumber.create({
        userId: merchantId,
        number: testNumber,
        status: 'active',
        agentId: agent.id
      });
    } else {
      console.log(`Updating existing test VoBiz number: ${testNumber} with Agent ID`);
      await vobizNumber.update({ agentId: agent.id, status: 'active' });
    }

    // Set up request and response mock objects
    const req = {
      query: {},
      body: {
        To: testNumber,
        From: '+15554443333',
        CallUUID: 'test-inbound-call-uuid-' + Date.now(),
        Direction: 'inbound',
        CallStatus: 'ringing'
      }
    };

    let responseXml = '';
    let responseHeaders = {};

    const res = {
      status: function(code) {
        console.log('Response status called with:', code);
        return this;
      },
      set: function(name, val) {
        responseHeaders[name] = val;
        return this;
      },
      send: function(data) {
        responseXml = data;
        return this;
      }
    };

    const next = (err) => {
      console.error('Next called with error:', err);
    };

    console.log('\n--- Triggering Inbound Call Webhook ---');
    await VobizController.answerCallWebhook(req, res, next);

    console.log('Response headers:', responseHeaders);
    console.log('Response XML:\n', responseXml);

    if (responseXml && responseXml.includes('<Stream')) {
      console.log('\nChecking created call session and logs in the database...');
      // Find the created session
      const session = await CallSession.findOne({
        where: {
          vobizNumberId: vobizNumber.id,
          agentId: agent.id
        },
        order: [['createdAt', 'DESC']]
      });

      if (session) {
        console.log(`[SUCCESS] CallSession created with ID: ${session.id}, status: ${session.status}`);
        
        // Check logs
        const log = await CallLog.findOne({
          where: { callSessionId: session.id }
        });
        if (log) {
          console.log(`[SUCCESS] CallLog created: "${log.message}"`);
        } else {
          console.log('[FAILED] CallLog not found');
        }

        // Clean up created session, logs, and customer to keep DB clean
        console.log('Cleaning up test data...');
        await CallLog.destroy({ where: { callSessionId: session.id } });
        await CallSession.destroy({ where: { id: session.id } });
        console.log('Clean up complete.');
      } else {
        console.log('[FAILED] CallSession was not created in DB');
      }
    } else {
      console.log('[FAILED] Webhook response did not contain Stream URL');
    }

  } catch (err) {
    console.error('Test execution failed:', err);
  }
  process.exit(0);
}

testInboundCall();
