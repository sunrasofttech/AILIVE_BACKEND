const { CallReport, Customer, Campaign, VobizNumber } = require('../models');
const ResponseBuilder = require('../utils/response');

class ReportController {
  /**
   * Get all reports for current merchant
   */
  async getAllReports(req, res, next) {
    try {
      const { campaignId, outcome, sentiment } = req.query;

      const filter = { userId: req.user.id };
      if (campaignId) filter.campaignId = campaignId;
      if (outcome) filter.outcome = outcome;
      if (sentiment) filter.sentiment = sentiment;

      const reports = await CallReport.findAll({
        where: filter,
        include: [
          { model: Customer, as: 'customer', attributes: ['name', 'mobile'] },
          { model: Campaign, as: 'campaign', attributes: ['name'] },
          { model: VobizNumber, as: 'vobizNumber', attributes: ['number'] },
        ],
        order: [['createdAt', 'DESC']],
      });

      return ResponseBuilder.success(res, reports, 'Call reports retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get call report details by session ID
   */
  async getReportBySession(req, res, next) {
    try {
      const report = await CallReport.findOne({
        where: { callSessionId: req.params.sessionId, userId: req.user.id },
        include: [
          { model: Customer, as: 'customer', attributes: ['name', 'mobile', 'tags', 'notes'] },
          { model: Campaign, as: 'campaign', attributes: ['name', 'startTime'] },
          { model: VobizNumber, as: 'vobizNumber', attributes: ['number'] },
        ],
      });

      if (!report) {
        return ResponseBuilder.error(res, 'Call report not found', 404);
      }

      return ResponseBuilder.success(res, report, 'Call report details retrieved');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ReportController();
