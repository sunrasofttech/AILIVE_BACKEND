const { duplicateClient } = require('../config/redis');
const AiAnalysisService = require('../services/aiAnalysisService');
const SubscriptionService = require('../services/subscriptionService');
const QueueService = require('../services/queueService');
const { CallReport, CampaignCustomer, Campaign, sequelize } = require('../models');

async function startAiWorker() {
  console.log('AI Worker started.');

  // Create duplicate redis client to handle blocking subscription listen
  const subClient = await duplicateClient();

  const channel = 'call_completed';

  await subClient.subscribe(channel, async (message) => {
    try {
      const event = JSON.parse(message);
      console.log(`AI Worker picked up completed call session: ${event.callSessionId}`);

      await processCallAnalysis(event);
    } catch (err) {
      console.error('AI Worker failed to process subscription event:', err);
    }
  });
}

/**
 * Invokes Gemini, saves CallReport, adjusts campaign progress and plan limits
 */
async function processCallAnalysis(event) {
  const { callSessionId, userId, campaignId, vobizNumberId, customerId, transcript, duration } = event;

  try {
    // 1. Trigger Gemini Transcript Analysis
    const analysis = await AiAnalysisService.analyzeTranscript(transcript);
    console.log(`[AI Analysis Result] Session: ${callSessionId} -> Outcome: ${analysis.outcome}, Score: ${analysis.leadScore}`);

    // 2. Save CallReport in DB
    await CallReport.create({
      userId,
      campaignId,
      callSessionId,
      vobizNumberId,
      customerId,
      transcript,
      summary: analysis.summary,
      duration,
      outcome: analysis.outcome,
      sentiment: analysis.sentiment,
      leadScore: analysis.leadScore,
    });

    // 3. Deduct call credit from merchant's subscription
    await SubscriptionService.recordCallUsage(userId);

    // 4. Update campaign customer status
    if (campaignId) {
      const callStatus = (analysis.outcome === 'No Answer' || analysis.outcome === 'Wrong Number') 
        ? 'failed' 
        : 'completed';

      await CampaignCustomer.update(
        { callStatus },
        { where: { campaignId, customerId } }
      );

      // Check if all campaign customers have been processed
      const remainingPending = await CampaignCustomer.count({
        where: { campaignId, callStatus: 'pending' },
      });

      const activeCalls = await QueueService.getActiveCalls(campaignId);

      if (remainingPending === 0 && activeCalls === 0) {
        // Mark campaign as completed
        const campaign = await Campaign.findByPk(campaignId);
        if (campaign && campaign.status === 'running') {
          campaign.status = 'completed';
          await campaign.save();
          console.log(`Campaign ${campaign.name} (${campaignId}) has no pending calls remaining. Marked Completed.`);
        }
      }
    }

  } catch (dbErr) {
    console.error(`DB Update Error in AI worker for session ${callSessionId}:`, dbErr);
  }
}

if (require.main === module) {
  startAiWorker();
}

module.exports = {
  startAiWorker,
};
