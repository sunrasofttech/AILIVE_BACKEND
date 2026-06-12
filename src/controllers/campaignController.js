const { Campaign, CampaignCustomer, CustomerList, CustomerListMember, Customer, VobizNumber, Agent, sequelize } = require('../models');
const ResponseBuilder = require('../utils/response');
const QueueService = require('../services/queueService');
const SubscriptionService = require('../services/subscriptionService');
const { createCampaignSchema, updateCampaignSchema } = require('../validators/campaign');

class CampaignController {
  /**
   * Get all merchant's campaigns
   */
  async getAll(req, res, next) {
    try {
      const campaigns = await Campaign.findAll({
        where: { userId: req.user.id },
        include: [
          { model: VobizNumber, as: 'vobizNumber' },
          { model: Agent, as: 'agent' },
          { model: CustomerList, as: 'customerList' },
        ],
      });
      return ResponseBuilder.success(res, campaigns, 'Campaigns retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get campaign details by ID
   */
  async getById(req, res, next) {
    try {
      const campaign = await Campaign.findOne({
        where: { id: req.params.id, userId: req.user.id },
        include: [
          { model: VobizNumber, as: 'vobizNumber' },
          { model: Agent, as: 'agent' },
          { model: CustomerList, as: 'customerList' },
          { model: CampaignCustomer, as: 'customerMappings', include: ['customer'] },
        ],
      });

      if (!campaign) {
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      return ResponseBuilder.success(res, campaign, 'Campaign details retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create Campaign in draft
   */
  async create(req, res, next) {
    try {
      const { error, value } = createCampaignSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { name, vobizNumberId, agentId, customerListId, startTime, intervalBetweenCalls, maxConcurrentCalls } = value;

      // 1. Validate VoBiz number belongs to merchant and is active
      const number = await VobizNumber.findOne({ where: { id: vobizNumberId, userId: req.user.id, status: 'active' } });
      if (!number) {
        return ResponseBuilder.error(res, 'Active VoBiz number not found under your account', 400);
      }

      // 2. Validate agent belongs to merchant (or is preloaded default)
      const agent = await Agent.findByPk(agentId);
      if (!agent || (agent.userId !== req.user.id && agent.isCustom)) {
        return ResponseBuilder.error(res, 'Voice Agent not found or unauthorized', 400);
      }

      // 3. Validate customer list belongs to merchant
      const list = await CustomerList.findOne({ where: { id: customerListId, userId: req.user.id } });
      if (!list) {
        return ResponseBuilder.error(res, 'Customer list not found', 400);
      }

      const campaign = await Campaign.create({
        userId: req.user.id,
        name,
        vobizNumberId,
        agentId,
        customerListId,
        startTime,
        intervalBetweenCalls,
        maxConcurrentCalls,
        status: 'draft',
      });

      return ResponseBuilder.success(res, campaign, 'Campaign created successfully in Draft', 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update Campaign details (Only allowed in Draft / Scheduled status)
   */
  async update(req, res, next) {
    try {
      const { error, value } = updateCampaignSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const campaign = await Campaign.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!campaign) {
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
        return ResponseBuilder.error(res, 'Campaign can only be updated while in draft or scheduled state', 400);
      }

      await campaign.update(value);
      return ResponseBuilder.success(res, campaign, 'Campaign details updated');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Start / Activate Campaign
   */
  async start(req, res, next) {
    const transaction = await sequelize.transaction();
    try {
      const campaign = await Campaign.findOne({
        where: { id: req.params.id, userId: req.user.id },
        transaction,
      });

      if (!campaign) {
        await transaction.rollback();
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      if (campaign.status !== 'draft') {
        await transaction.rollback();
        return ResponseBuilder.error(res, 'Only draft campaigns can be started', 400);
      }

      // 1. Validate subscription limits
      const limitCheck = await SubscriptionService.validateCallLimits(req.user.id);
      if (!limitCheck.isValid) {
        await transaction.rollback();
        return ResponseBuilder.error(res, `Failed to start campaign: ${limitCheck.reason}`, 403);
      }

      const startTime = new Date(campaign.startTime);
      const isImmediate = startTime <= new Date();

      if (isImmediate) {
        // Start running immediately
        campaign.status = 'running';
        await campaign.save({ transaction });

        // Fetch customers from list and populate campaign_customers
        const members = await CustomerListMember.findAll({
          where: { customerListId: campaign.customerListId },
          transaction,
        });

        if (members.length === 0) {
          await transaction.rollback();
          return ResponseBuilder.error(res, 'Target customer list is empty. Cannot start campaign.', 400);
        }

        const campaignCustomers = members.map((m) => ({
          campaignId: campaign.id,
          customerId: m.customerId,
          callStatus: 'pending',
        }));

        await CampaignCustomer.bulkCreate(campaignCustomers, { ignoreDuplicates: true, transaction });

        await transaction.commit();

        // Schedule individual calls in Redis
        const spacingSeconds = campaign.intervalBetweenCalls || 5;
        const now = Date.now();

        for (let i = 0; i < members.length; i++) {
          const runAt = now + (i * spacingSeconds * 1000);
          await QueueService.scheduleJob(
            'PLACE_CALL',
            {
              campaignId: campaign.id,
              customerId: members[i].customerId,
              userId: req.user.id,
            },
            runAt
          );
        }

        return ResponseBuilder.success(res, campaign, 'Campaign started immediately');
      } else {
        // Schedule start via Redis Sorted Set
        campaign.status = 'scheduled';
        await campaign.save({ transaction });
        await transaction.commit();

        await QueueService.scheduleJob(
          'START_CAMPAIGN',
          {
            campaignId: campaign.id,
            userId: req.user.id,
          },
          startTime.getTime()
        );

        return ResponseBuilder.success(res, campaign, `Campaign scheduled to start at ${campaign.startTime}`);
      }
    } catch (err) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      next(err);
    }
  }

  /**
   * Pause Campaign
   */
  async pause(req, res, next) {
    try {
      const campaign = await Campaign.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!campaign) {
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      if (campaign.status !== 'running') {
        return ResponseBuilder.error(res, 'Only running campaigns can be paused', 400);
      }

      campaign.status = 'paused';
      await campaign.save();

      return ResponseBuilder.success(res, campaign, 'Campaign paused successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Resume Campaign
   */
  async resume(req, res, next) {
    try {
      const campaign = await Campaign.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!campaign) {
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      if (campaign.status !== 'paused') {
        return ResponseBuilder.error(res, 'Only paused campaigns can be resumed', 400);
      }

      // Validate limits again
      const limitCheck = await SubscriptionService.validateCallLimits(req.user.id);
      if (!limitCheck.isValid) {
        return ResponseBuilder.error(res, `Failed to resume campaign: ${limitCheck.reason}`, 403);
      }

      campaign.status = 'running';
      await campaign.save();

      // Find remaining pending calls and reschedule them
      const pendingCustomers = await CampaignCustomer.findAll({
        where: { campaignId: campaign.id, callStatus: 'pending' },
      });

      const spacingSeconds = campaign.intervalBetweenCalls || 5;
      const now = Date.now();

      for (let i = 0; i < pendingCustomers.length; i++) {
        const runAt = now + (i * spacingSeconds * 1000);
        await QueueService.scheduleJob(
          'PLACE_CALL',
          {
            campaignId: campaign.id,
            customerId: pendingCustomers[i].customerId,
            userId: req.user.id,
          },
          runAt
        );
      }

      return ResponseBuilder.success(res, campaign, 'Campaign resumed. Pending calls rescheduled.');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Stop Campaign
   */
  async stop(req, res, next) {
    try {
      const campaign = await Campaign.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!campaign) {
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      if (campaign.status !== 'running' && campaign.status !== 'paused') {
        return ResponseBuilder.error(res, 'Campaign is not currently running or paused', 400);
      }

      campaign.status = 'completed'; // Stopped campaigns are marked completed/finished
      await campaign.save();

      // Clear concurrency key in Redis
      await QueueService.clearActiveCalls(campaign.id);

      return ResponseBuilder.success(res, campaign, 'Campaign stopped successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Retry Failed Calls in Campaign
   */
  async retryFailedCalls(req, res, next) {
    try {
      const campaign = await Campaign.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!campaign) {
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      if (campaign.status !== 'completed' && campaign.status !== 'failed') {
        return ResponseBuilder.error(res, 'Campaign must be completed or failed to retry calls', 400);
      }

      // Check limits
      const limitCheck = await SubscriptionService.validateCallLimits(req.user.id);
      if (!limitCheck.isValid) {
        return ResponseBuilder.error(res, `Failed to retry calls: ${limitCheck.reason}`, 403);
      }

      // Fetch failed calls in this campaign
      const failedMappings = await CampaignCustomer.findAll({
        where: { campaignId: campaign.id, callStatus: 'failed' },
      });

      if (failedMappings.length === 0) {
        return ResponseBuilder.error(res, 'No failed calls found to retry', 400);
      }

      // Reset failed mappings to pending
      for (const mapping of failedMappings) {
        mapping.callStatus = 'pending';
        mapping.retryCount += 1;
        await mapping.save();
      }

      // Set campaign to running again
      campaign.status = 'running';
      await campaign.save();

      // Reschedule jobs in Redis
      const spacingSeconds = campaign.intervalBetweenCalls || 5;
      const now = Date.now();

      for (let i = 0; i < failedMappings.length; i++) {
        const runAt = now + (i * spacingSeconds * 1000);
        await QueueService.scheduleJob(
          'PLACE_CALL',
          {
            campaignId: campaign.id,
            customerId: failedMappings[i].customerId,
            userId: req.user.id,
          },
          runAt
        );
      }

      return ResponseBuilder.success(res, campaign, `Retrying ${failedMappings.length} failed calls`);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete Campaign (Soft delete)
   */
  async delete(req, res, next) {
    try {
      const campaign = await Campaign.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!campaign) {
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      await campaign.destroy();
      return ResponseBuilder.success(res, null, 'Campaign deleted successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CampaignController();
