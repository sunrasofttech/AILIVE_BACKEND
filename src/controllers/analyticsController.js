const { CallReport, Subscription, Campaign, CampaignCustomer, sequelize } = require('../models');
const ResponseBuilder = require('../utils/response');
const { Op } = require('sequelize');

class AnalyticsController {
  /**
   * Get campaign performance statistics
   */
  async getCampaignStats(req, res, next) {
    try {
      const { campaignId } = req.query;

      const filter = { userId: req.user.id };
      if (campaignId) {
        filter.campaignId = campaignId;
      }

      // Aggregate call counts from CallReport
      const stats = await CallReport.findAll({
        where: filter,
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalCalls'],
          [
            sequelize.fn(
              'SUM',
              sequelize.literal("CASE WHEN outcome IN ('Interested', 'Appointment Booked', 'Sale Closed', 'Callback Requested') THEN 1 ELSE 0 END")
            ),
            'successfulCalls',
          ],
          [
            sequelize.fn(
              'SUM',
              sequelize.literal("CASE WHEN outcome IN ('Wrong Number', 'No Answer') THEN 1 ELSE 0 END")
            ),
            'failedCalls',
          ],
          [sequelize.fn('AVG', sequelize.col('duration')), 'averageDuration'],
        ],
        raw: true,
      });

      // Fetch running/active calls count across campaigns
      let activeCallsCount = 0;
      if (campaignId) {
        const campaign = await Campaign.findOne({ where: { id: campaignId, userId: req.user.id } });
        if (campaign && campaign.status === 'running') {
          activeCallsCount = await CampaignCustomer.count({
            where: { campaignId, callStatus: 'calling' },
          });
        }
      } else {
        const activeCampaigns = await Campaign.findAll({
          where: { userId: req.user.id, status: 'running' },
          attributes: ['id'],
        });
        const campaignIds = activeCampaigns.map((c) => c.id);
        if (campaignIds.length > 0) {
          activeCallsCount = await CampaignCustomer.count({
            where: { campaignId: campaignIds, callStatus: 'calling' },
          });
        }
      }

      const reportStats = stats[0] || {};

      return ResponseBuilder.success(res, {
        totalCalls: parseInt(reportStats.totalCalls || 0, 10),
        completedCalls: parseInt(reportStats.totalCalls || 0, 10) - parseInt(reportStats.failedCalls || 0, 10),
        failedCalls: parseInt(reportStats.failedCalls || 0, 10),
        activeCalls: activeCallsCount,
        averageDurationSeconds: Math.round(parseFloat(reportStats.averageDuration || 0)),
      }, 'Campaign analytics retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get lead and sales indicators
   */
  async getLeadStats(req, res, next) {
    try {
      const { campaignId } = req.query;

      const filter = { userId: req.user.id };
      if (campaignId) {
        filter.campaignId = campaignId;
      }

      // Count outcomes
      const leadIndicators = await CallReport.findAll({
        where: filter,
        attributes: [
          [
            sequelize.fn(
              'SUM',
              sequelize.literal("CASE WHEN outcome IN ('Interested', 'Appointment Booked', 'Sale Closed') THEN 1 ELSE 0 END")
            ),
            'interestedLeads',
          ],
          [
            sequelize.fn(
              'SUM',
              sequelize.literal("CASE WHEN outcome = 'Callback Requested' THEN 1 ELSE 0 END")
            ),
            'callbacksRequested',
          ],
          [
            sequelize.fn(
              'SUM',
              sequelize.literal("CASE WHEN outcome = 'Appointment Booked' THEN 1 ELSE 0 END")
            ),
            'appointmentsBooked',
          ],
          [
            sequelize.fn(
              'SUM',
              sequelize.literal("CASE WHEN outcome = 'Sale Closed' THEN 1 ELSE 0 END")
            ),
            'salesClosed',
          ],
        ],
        raw: true,
      });

      const metrics = leadIndicators[0] || {};

      return ResponseBuilder.success(res, {
        interestedLeads: parseInt(metrics.interestedLeads || 0, 10),
        callbacksRequested: parseInt(metrics.callbacksRequested || 0, 10),
        appointmentsBooked: parseInt(metrics.appointmentsBooked || 0, 10),
        salesClosed: parseInt(metrics.salesClosed || 0, 10),
      }, 'Lead analytics retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get merchant plan utilization
   */
  async getPlanUtilization(req, res, next) {
    try {
      const subscription = await Subscription.findOne({
        where: { userId: req.user.id },
      });

      if (!subscription) {
        return ResponseBuilder.error(res, 'No subscription plan configuration found', 404);
      }

      const totalCallsLimit = subscription.callsUsed + subscription.callsRemaining;
      const utilization = totalCallsLimit > 0
        ? Math.round((subscription.callsUsed / totalCallsLimit) * 100)
        : 0;

      return ResponseBuilder.success(res, {
        activePlan: subscription.activePlan,
        callsUsed: subscription.callsUsed,
        callsRemaining: subscription.callsRemaining,
        planExpiry: subscription.expiryDate,
        utilizationPercentage: utilization,
      }, 'Plan utilization analytics retrieved');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AnalyticsController();
