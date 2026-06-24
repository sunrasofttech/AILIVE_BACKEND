const { Agent, Setting, User } = require('../models');
const ResponseBuilder = require('../utils/response');

class AdminController {
  /**
   * Get all agents that are pending approval
   */
  async getPendingAgents(req, res, next) {
    try {
      const agents = await Agent.findAll({
        where: { approvalStatus: 'pending' },
        include: [{ model: User, as: 'user', attributes: ['id', 'email', 'businessName'] }]
      });
      return ResponseBuilder.success(res, agents, 'Pending agents retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Approve an agent
   */
  async approveAgent(req, res, next) {
    try {
      const agent = await Agent.findByPk(req.params.id);
      if (!agent) {
        return ResponseBuilder.error(res, 'Agent not found', 404);
      }

      await agent.update({
        approvalStatus: 'approved',
        activeStatus: true,
      });

      return ResponseBuilder.success(res, agent, 'Agent approved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Reject an agent
   */
  async rejectAgent(req, res, next) {
    try {
      const agent = await Agent.findByPk(req.params.id);
      if (!agent) {
        return ResponseBuilder.error(res, 'Agent not found', 404);
      }

      await agent.update({
        approvalStatus: 'rejected',
        activeStatus: false,
      });

      return ResponseBuilder.success(res, agent, 'Agent rejected successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get sensitive words
   */
  async getSensitiveWords(req, res, next) {
    try {
      const setting = await Setting.findOne({ where: { key: 'sensitive_words' } });
      const words = setting && setting.value ? setting.value : ['scam', 'fraud', 'hack', 'abuse', 'illegal', 'terror', 'bomb', 'kill', 'murder', 'phishing', 'spam'];
      return ResponseBuilder.success(res, { sensitiveWords: words }, 'Sensitive words retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update sensitive words
   */
  async updateSensitiveWords(req, res, next) {
    try {
      const { words } = req.body;
      if (!words || !Array.isArray(words)) {
        return ResponseBuilder.error(res, 'Please provide an array of words', 400);
      }

      let setting = await Setting.findOne({ where: { key: 'sensitive_words' } });
      if (setting) {
        await setting.update({ value: words });
      } else {
        setting = await Setting.create({ key: 'sensitive_words', value: words });
      }

      return ResponseBuilder.success(res, { sensitiveWords: setting.value }, 'Sensitive words updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get KYC 48h Rate Limit Calls
   */
  async getKycRateLimit(req, res, next) {
    try {
      const setting = await Setting.findOne({ where: { key: 'kyc_rate_limit_calls' } });
      const limit = setting && setting.value ? parseInt(setting.value, 10) : 10;
      return ResponseBuilder.success(res, { kycRateLimitCalls: limit }, 'KYC Rate Limit retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update KYC 48h Rate Limit Calls
   */
  async updateKycRateLimit(req, res, next) {
    try {
      const { limit } = req.body;
      if (limit === undefined || isNaN(limit)) {
        return ResponseBuilder.error(res, 'Please provide a valid numeric limit', 400);
      }

      let setting = await Setting.findOne({ where: { key: 'kyc_rate_limit_calls' } });
      if (setting) {
        await setting.update({ value: limit });
      } else {
        setting = await Setting.create({ key: 'kyc_rate_limit_calls', value: limit });
      }

      return ResponseBuilder.success(res, { kycRateLimitCalls: parseInt(setting.value, 10) }, 'KYC Rate Limit updated successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AdminController();
