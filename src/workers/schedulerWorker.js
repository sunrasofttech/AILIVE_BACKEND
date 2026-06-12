const QueueService = require('../services/queueService');
const { Campaign, CustomerListMember, CampaignCustomer, sequelize } = require('../models');
require('../config/redis'); // ensure connection initialized

async function startScheduler() {
  console.log('Scheduler Worker started.');

  // Infinite poll loop
  while (true) {
    try {
      const now = Date.now();
      const readyJobs = await QueueService.fetchReadyScheduledJobs(now);

      for (const job of readyJobs) {
        console.log(`Processing scheduled job: ${job.type}`);
        
        if (job.type === 'START_CAMPAIGN') {
          await handleStartCampaign(job.payload);
        } else if (job.type === 'PLACE_CALL') {
          // Move to FIFO execution queue
          await QueueService.enqueueJob('PLACE_CALL', job.payload);
          console.log(`Moved call placement job to call_queue for Customer: ${job.payload.customerId}`);
        }
      }
    } catch (error) {
      console.error('Error in Scheduler Worker polling loop:', error);
    }
    
    // Sleep 1 second before next poll
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/**
 * Loads customer list details and schedules individual call jobs in Redis Sorted Set
 */
async function handleStartCampaign(payload) {
  const { campaignId, userId } = payload;
  const transaction = await sequelize.transaction();

  try {
    const campaign = await Campaign.findByPk(campaignId, { transaction });
    if (!campaign) {
      console.log(`Campaign ${campaignId} not found. Skipping.`);
      await transaction.rollback();
      return;
    }

    if (campaign.status !== 'scheduled' && campaign.status !== 'draft') {
      console.log(`Campaign ${campaignId} status is: ${campaign.status}. Skipping.`);
      await transaction.rollback();
      return;
    }

    // Set status to running
    campaign.status = 'running';
    await campaign.save({ transaction });

    // Fetch customers in the campaign list
    const members = await CustomerListMember.findAll({
      where: { customerListId: campaign.customerListId },
      transaction,
    });

    if (members.length === 0) {
      console.warn(`Campaign ${campaignId} targets an empty customer list. Completing.`);
      campaign.status = 'completed';
      await campaign.save({ transaction });
      await transaction.commit();
      return;
    }

    // Insert pending campaign customers
    const campaignCustomers = members.map((m) => ({
      campaignId: campaign.id,
      customerId: m.customerId,
      callStatus: 'pending',
    }));

    await CampaignCustomer.bulkCreate(campaignCustomers, { ignoreDuplicates: true, transaction });
    await transaction.commit();

    // Schedule calls with interval pacing
    const spacingSeconds = campaign.intervalBetweenCalls || 5;
    const now = Date.now();

    for (let i = 0; i < members.length; i++) {
      const runAt = now + (i * spacingSeconds * 1000);
      await QueueService.scheduleJob(
        'PLACE_CALL',
        {
          campaignId: campaign.id,
          customerId: members[i].customerId,
          userId,
        },
        runAt
      );
    }
    console.log(`Successfully scheduled ${members.length} calls for Campaign: ${campaign.name}`);

  } catch (err) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    console.error(`Failed to handle START_CAMPAIGN for ${campaignId}:`, err);
  }
}

// Start processing if executed directly
if (require.main === module) {
  startScheduler();
}

module.exports = {
  startScheduler,
};
