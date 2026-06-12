const crypto = require('crypto');
const { duplicateClient } = require('../config/redis');
const QueueService = require('../services/queueService');
const SubscriptionService = require('../services/subscriptionService');
const VobizService = require('../services/vobizService');
const { Campaign, CampaignCustomer, CallSession, CallLog, VobizNumber, VobizAccount, User, Agent } = require('../models');

async function startCallWorker() {
  console.log('Call Worker started.');
  
  // Create duplicate redis client for blocking BLPOP command
  const client = await duplicateClient();
  
  const CALL_QUEUE = 'call_queue';

  while (true) {
    try {
      // BLPOP returns: [keyName, elementValue]
      // Wait up to 30 seconds for a job
      const jobData = await client.blPop(CALL_QUEUE, 30);
      
      if (!jobData) {
        continue; // Timeout, loop again
      }

      const parsed = JSON.parse(jobData.element);
      console.log(`Processing call job for Customer: ${parsed.payload.customerId}`);

      if (parsed.type === 'PLACE_CALL') {
        await processPlaceCall(parsed.payload);
      }

    } catch (error) {
      console.error('Error in Call Worker execution:', error);
    }
  }
}

/**
 * Validates, checks concurrency, creates CallSession, and dials VoBiz
 */
async function processPlaceCall(payload) {
  const { campaignId, customerId, userId } = payload;

  try {
    // 1. Fetch Campaign and verify if still active
    const campaign = await Campaign.findByPk(campaignId);
    if (!campaign) {
      console.log(`Campaign ${campaignId} deleted. Discarding call job.`);
      return;
    }

    if (campaign.status === 'paused') {
      // Re-schedule in Redis sorted set with 5-second delay to try again once resumed
      console.log(`Campaign ${campaign.name} is paused. Re-scheduling call job.`);
      await QueueService.scheduleJob('PLACE_CALL', payload, Date.now() + 5000);
      return;
    }

    if (campaign.status !== 'running') {
      console.log(`Campaign ${campaign.name} status is ${campaign.status}. Discarding call job.`);
      return;
    }

    // 2. Validate Subscription Call Limits
    const limitCheck = await SubscriptionService.validateCallLimits(userId);
    if (!limitCheck.isValid) {
      console.log(`Merchant ${userId} subscription limits exceeded: ${limitCheck.reason}. Failing campaign.`);
      campaign.status = 'failed';
      await campaign.save();
      
      // Update pending customers to failed
      await CampaignCustomer.update(
        { callStatus: 'failed' },
        { where: { campaignId: campaign.id, callStatus: 'pending' } }
      );
      return;
    }

    // 3. Concurrency Control
    const activeCalls = await QueueService.getActiveCalls(campaignId);
    if (activeCalls >= campaign.maxConcurrentCalls) {
      // Re-schedule with 5-second delay
      console.log(`Campaign ${campaign.name} concurrency limit saturated (${activeCalls}/${campaign.maxConcurrentCalls}). Re-scheduling call job.`);
      await QueueService.scheduleJob('PLACE_CALL', payload, Date.now() + 5000);
      return;
    }

    // 4. Check if already called/calling this customer to avoid race conditions
    const customerMapping = await CampaignCustomer.findOne({
      where: { campaignId, customerId },
    });

    if (!customerMapping || customerMapping.callStatus === 'completed' || customerMapping.callStatus === 'calling') {
      console.log(`Customer ${customerId} is already processed or being processed. Skipping.`);
      return;
    }

    // 5. Connect and Dial
    // Get Merchant VoBiz account credentials and VoBiz Number
    const vobizAccount = await VobizAccount.findOne({ where: { userId } });
    const vobizNumber = await VobizNumber.findByPk(campaign.vobizNumberId);
    const customer = await customerMapping.getCustomer();

    if (!vobizAccount || !vobizNumber) {
      console.log(`Missing VoBiz configuration for merchant ${userId}. Failing this call.`);
      customerMapping.callStatus = 'failed';
      await customerMapping.save();
      return;
    }

    // Increment concurrency counter
    await QueueService.incrementActiveCalls(campaignId);

    // Create session token and db call record
    const wsToken = crypto.randomBytes(32).toString('hex');
    
    const session = await CallSession.create({
      userId,
      campaignId,
      agentId: campaign.agentId,
      vobizNumberId: campaign.vobizNumberId,
      customerId,
      wsSessionToken: wsToken,
      status: 'initiated',
    });

    customerMapping.callStatus = 'calling';
    customerMapping.lastCallTime = new Date();
    await customerMapping.save();

    await CallLog.create({
      callSessionId: session.id,
      logLevel: 'info',
      message: `Call job dispatched. Outbound dial initiated to ${customer.mobile}`,
    });

    // Invoke VoBiz Outbound dialing API
    const dialResponse = await VobizService.initiateCall({
      apiKey: vobizAccount.apiKey,
      apiSecret: vobizAccount.apiSecret,
      fromNumber: vobizNumber.number,
      toNumber: customer.mobile,
      wsToken,
    });

    if (!dialResponse.success) {
      console.error(`VoBiz dial failed for customer ${customer.mobile}:`, dialResponse.error);
      
      // Dial failed instantly: clean up session
      session.status = 'failed';
      session.endTime = new Date();
      await session.save();

      await CallLog.create({
        callSessionId: session.id,
        logLevel: 'error',
        message: `VoBiz outbound dial trigger failed: ${dialResponse.error}`,
      });

      customerMapping.callStatus = 'failed';
      await customerMapping.save();

      // Decrement concurrency
      await QueueService.decrementActiveCalls(campaignId);
    }

  } catch (err) {
    console.error(`Error processing call job for Customer ${customerId}:`, err);
  }
}

if (require.main === module) {
  startCallWorker();
}

module.exports = {
  startCallWorker,
};
