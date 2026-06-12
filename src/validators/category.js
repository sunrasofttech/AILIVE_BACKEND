// Category Joi validators
const Joi = require('joi');

const createCategorySchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  defaultPrompt: Joi.string().required(),
  defaultVoiceId: Joi.string().uuid().optional(),
  defaultLanguage: Joi.string().max(10).default('en'),
  defaultAgentConfig: Joi.object().optional(),
});

const updateCategorySchema = Joi.object({
  name: Joi.string().min(2).max(50).optional(),
  defaultPrompt: Joi.string().optional(),
  defaultVoiceId: Joi.string().uuid().optional(),
  defaultLanguage: Joi.string().max(10).optional(),
  defaultAgentConfig: Joi.object().optional(),
});

module.exports = {
  createCategorySchema,
  updateCategorySchema,
};
