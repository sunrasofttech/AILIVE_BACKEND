const Joi = require('joi');

const createCampaignSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  vobizNumberId: Joi.string().uuid().required(),
  agentId: Joi.string().uuid().required(),
  customerListId: Joi.string().uuid().required(),
  startTime: Joi.date().iso().required(),
  intervalBetweenCalls: Joi.number().integer().min(1).default(5),
  maxConcurrentCalls: Joi.number().integer().min(1).default(1),
  status: Joi.string().valid('draft', 'scheduled').default('draft'),
});

const updateCampaignSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  vobizNumberId: Joi.string().uuid().optional(),
  agentId: Joi.string().uuid().optional(),
  customerListId: Joi.string().uuid().optional(),
  startTime: Joi.date().iso().optional(),
  intervalBetweenCalls: Joi.number().integer().min(1).optional(),
  maxConcurrentCalls: Joi.number().integer().min(1).optional(),
  status: Joi.string().valid('draft', 'scheduled', 'running', 'paused', 'completed', 'failed').optional(),
});

module.exports = {
  createCampaignSchema,
  updateCampaignSchema,
};
