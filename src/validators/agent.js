const Joi = require('joi');

const createAgentSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().max(500).optional(),
  systemPrompt: Joi.string().min(10).required(),
  language: Joi.string().max(10).default('en'),
  voiceId: Joi.string().uuid().required(),
  categoryId: Joi.string().uuid().optional(),
  activeStatus: Joi.boolean().default(true),
});

const updateAgentSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  description: Joi.string().max(500).optional(),
  systemPrompt: Joi.string().min(10).optional(),
  language: Joi.string().max(10).optional(),
  voiceId: Joi.string().uuid().optional(),
  categoryId: Joi.string().uuid().optional(),
  activeStatus: Joi.boolean().optional(),
});

module.exports = {
  createAgentSchema,
  updateAgentSchema,
};
